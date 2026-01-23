// src/pages/accounting/PeriodClosing.tsx
import { useState, useEffect } from "react";
import { Lock, Unlock, Download, CheckCircle, Circle, AlertTriangle } from "lucide-react";
import { db } from "@/firebase";
import { collection, doc, getDocs, setDoc, updateDoc, Timestamp } from "firebase/firestore";
import { useUser } from "@/components/AuthGate";
import type { Transaction, AccountingPeriod } from "@/lib/accountingSchemas";
import { validateEntity, logAuditEntry, type RuleResult, type PeriodClosingData } from "@/lib/ruleEngine";
import { ValidationModal } from "@/components/HelpTip";

function getCompanyId(): string {
  const stored = localStorage.getItem("gpcs-company-id");
  return stored || "gpcs";
}

function formatEUR(amount: number): string {
  return new Intl.NumberFormat("sk-SK", { style: "currency", currency: "EUR" }).format(amount);
}

interface PeriodSummary {
  period: string;
  year: number;
  month: number;
  transactionCount: number;
  totalMd: number;
  totalD: number;
  draftCount: number;
  status: "OPEN" | "CLOSING" | "CLOSED" | "LOCKED";
  lockedAt?: Timestamp;
  lockedBy?: string;
}

export default function PeriodClosing() {
  const user = useUser();
  const [periods, setPeriods] = useState<PeriodSummary[]>([]);
  const [, setLocks] = useState<Map<string, AccountingPeriod>>(new Map());
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodSummary | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear());

  useEffect(() => {
    loadData();
  }, [yearFilter]);

  async function loadData() {
    setLoading(true);
    const companyId = getCompanyId();
    
    // Load period locks
    const locksRef = collection(db, "companies", companyId, "periodLocks");
    const locksSnap = await getDocs(locksRef);
    const locksMap = new Map<string, AccountingPeriod>();
    locksSnap.docs.forEach((d) => {
      const lock = { id: d.id, ...d.data() } as AccountingPeriod;
      locksMap.set(lock.id, lock);
    });
    setLocks(locksMap);
    
    // Load transactions and calculate period summaries
    const transactionsRef = collection(db, "companies", companyId, "transactions");
    const transactionsSnap = await getDocs(transactionsRef);
    
    const periodMap = new Map<string, PeriodSummary>();
    
    // Initialize all months for the year
    for (let month = 1; month <= 12; month++) {
      const periodId = `${yearFilter}-${String(month).padStart(2, "0")}`;
      const lock = locksMap.get(periodId);
      periodMap.set(periodId, {
        period: periodId,
        year: yearFilter,
        month,
        transactionCount: 0,
        totalMd: 0,
        totalD: 0,
        draftCount: 0,
        status: lock?.status || "OPEN",
        lockedAt: lock?.lockedAt,
        lockedBy: lock?.lockedBy,
      });
    }
    
    // Aggregate transactions
    transactionsSnap.docs.forEach((docSnap) => {
      const transaction = { id: docSnap.id, ...docSnap.data() } as Transaction;
      
      if (!transaction.period.startsWith(String(yearFilter))) return;
      
      const summary = periodMap.get(transaction.period);
      if (summary) {
        summary.transactionCount++;
        summary.totalMd += transaction.totalMd;
        summary.totalD += transaction.totalD;
        if (transaction.status === "DRAFT") {
          summary.draftCount++;
        }
      }
    });
    
    const sortedPeriods = Array.from(periodMap.values()).sort((a, b) => a.period.localeCompare(b.period));
    setPeriods(sortedPeriods);
    setLoading(false);
  }

  const [validationResult, setValidationResult] = useState<RuleResult | null>(null);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [pendingLockPeriod, setPendingLockPeriod] = useState<PeriodSummary | null>(null);

  async function lockPeriod(period: PeriodSummary, overrideWarnings = false) {
    const companyId = getCompanyId();
    
    // Count open 311/321 items for this period
    const transactionsRef = collection(db, "companies", companyId, "transactions");
    const transactionsSnap = await getDocs(transactionsRef);
    
    let open311Count = 0;
    let open321Count = 0;
    const partnerBalances311 = new Map<string, number>();
    const partnerBalances321 = new Map<string, number>();
    
    transactionsSnap.docs.forEach((docSnap) => {
      const tx = docSnap.data() as Transaction;
      if (tx.status === "DRAFT") return;
      
      tx.lines?.forEach((line: any) => {
        if (line.accountCode === "311" && line.partnerId) {
          const current = partnerBalances311.get(line.partnerId) || 0;
          partnerBalances311.set(line.partnerId, current + (line.side === "MD" ? line.amount : -line.amount));
        }
        if (line.accountCode === "321" && line.partnerId) {
          const current = partnerBalances321.get(line.partnerId) || 0;
          partnerBalances321.set(line.partnerId, current + (line.side === "D" ? line.amount : -line.amount));
        }
      });
    });
    
    partnerBalances311.forEach((balance) => {
      if (Math.abs(balance) > 0.01) open311Count++;
    });
    partnerBalances321.forEach((balance) => {
      if (Math.abs(balance) > 0.01) open321Count++;
    });
    
    // Run validation
    const closingData: PeriodClosingData = {
      period: period.period,
      inboxPendingCount: 0, // TODO: count from uploads
      draftTransactionCount: period.draftCount,
      open311Count,
      open321Count,
      isAlreadyLocked: period.status === "LOCKED",
    };
    
    const result = await validateEntity("PERIOD_CLOSING", closingData, { companyId, period: period.period });
    
    // If there are blocks, show modal and stop
    if (result.blocks.length > 0) {
      setValidationResult(result);
      setShowValidationModal(true);
      setPendingLockPeriod(period);
      return;
    }
    
    // If there are warnings and not overriding, show modal
    if (result.warnings.length > 0 && !overrideWarnings) {
      setValidationResult(result);
      setShowValidationModal(true);
      setPendingLockPeriod(period);
      return;
    }
    
    // Log override if warnings were bypassed
    if (overrideWarnings && result.warnings.length > 0) {
      await logAuditEntry(companyId, {
        type: "OVERRIDE_WARNING",
        ruleCodes: result.warnings.map((w) => w.code),
        entityType: "PERIOD_CLOSING",
        ref: { period: period.period },
        by: user?.uid || "",
        notes: `Uzávierka obdobia ${period.period} napriek ${result.warnings.length} upozorneniam`,
      });
    }
    
    // Log period lock
    await logAuditEntry(companyId, {
      type: "PERIOD_LOCK",
      ruleCodes: [],
      entityType: "PERIOD_CLOSING",
      ref: { period: period.period },
      by: user?.uid || "",
    });
    
    const lockRef = doc(db, "companies", companyId, "periodLocks", period.period);
    const now = Timestamp.now();
    
    await setDoc(lockRef, {
      id: period.period,
      year: period.year,
      month: period.month,
      status: "LOCKED",
      lockedAt: now,
      lockedBy: user?.uid,
    });
    
    // Also update all transactions in this period to LOCKED status
    for (const docSnap of transactionsSnap.docs) {
      const transaction = docSnap.data() as Transaction;
      if (transaction.period === period.period && transaction.status === "POSTED") {
        await updateDoc(doc(transactionsRef, docSnap.id), {
          status: "LOCKED",
          lockedAt: now,
        });
      }
    }
    
    await loadData();
  }

  async function unlockPeriod(period: PeriodSummary) {
    if (!confirm(`Naozaj chcete odomknúť obdobie ${period.period}?`)) {
      return;
    }
    
    const companyId = getCompanyId();
    const lockRef = doc(db, "companies", companyId, "periodLocks", period.period);
    
    await setDoc(lockRef, {
      id: period.period,
      year: period.year,
      month: period.month,
      status: "OPEN",
    });
    
    // Update transactions back to POSTED
    const transactionsRef = collection(db, "companies", companyId, "transactions");
    const transactionsSnap = await getDocs(transactionsRef);
    
    for (const docSnap of transactionsSnap.docs) {
      const transaction = docSnap.data() as Transaction;
      if (transaction.period === period.period && transaction.status === "LOCKED") {
        await updateDoc(doc(transactionsRef, docSnap.id), {
          status: "POSTED",
          lockedAt: null,
        });
      }
    }
    
    await loadData();
  }

  const getStatusBadge = (status: string, draftCount: number) => {
    if (status === "LOCKED") {
      return <span className="px-2 py-1 bg-slate-700 text-white rounded-full text-xs font-medium flex items-center gap-1"><Lock size={12} /> Zamknuté</span>;
    }
    if (draftCount > 0) {
      return <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">{draftCount} konceptov</span>;
    }
    return <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">Otvorené</span>;
  };

  const getMonthName = (month: number) => {
    const names = ["", "Január", "Február", "Marec", "Apríl", "Máj", "Jún", "Júl", "August", "September", "Október", "November", "December"];
    return names[month];
  };

  // Calculate year totals
  const yearTotals = periods.reduce((acc, p) => ({
    transactions: acc.transactions + p.transactionCount,
    md: acc.md + p.totalMd,
    d: acc.d + p.totalD,
    drafts: acc.drafts + p.draftCount,
    locked: acc.locked + (p.status === "LOCKED" ? 1 : 0),
  }), { transactions: 0, md: 0, d: 0, drafts: 0, locked: 0 });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Uzávierky</h1>
          <p className="text-slate-500">Mesačná a ročná uzávierka účtovného obdobia</p>
        </div>
        <div className="flex gap-2">
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(parseInt(e.target.value))}
            className="px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
          >
            {[2024, 2025, 2026, 2027].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Year summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="text-sm text-slate-500">Transakcií</div>
          <div className="text-2xl font-bold text-slate-900">{yearTotals.transactions}</div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="text-sm text-slate-500">Σ MD</div>
          <div className="text-xl font-bold text-slate-900">{formatEUR(yearTotals.md)}</div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="text-sm text-slate-500">Σ D</div>
          <div className="text-xl font-bold text-slate-900">{formatEUR(yearTotals.d)}</div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="text-sm text-slate-500">Koncepty</div>
          <div className={`text-2xl font-bold ${yearTotals.drafts > 0 ? "text-amber-600" : "text-emerald-600"}`}>
            {yearTotals.drafts}
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="text-sm text-slate-500">Zamknuté mesiace</div>
          <div className="text-2xl font-bold text-slate-900">{yearTotals.locked}/12</div>
        </div>
      </div>

      {/* Periods grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {periods.map((period) => (
          <div
            key={period.period}
            className={`bg-white rounded-2xl shadow-sm border p-5 ${
              period.status === "LOCKED" ? "border-slate-300 bg-slate-50" : "border-slate-100"
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="font-semibold text-slate-900">{getMonthName(period.month)}</div>
                <div className="text-sm text-slate-500">{period.period}</div>
              </div>
              {getStatusBadge(period.status, period.draftCount)}
            </div>
            
            <div className="space-y-2 text-sm mb-4">
              <div className="flex justify-between">
                <span className="text-slate-500">Transakcií</span>
                <span className="font-medium">{period.transactionCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Obrat MD</span>
                <span className="font-mono">{formatEUR(period.totalMd)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Obrat D</span>
                <span className="font-mono">{formatEUR(period.totalD)}</span>
              </div>
            </div>
            
            <div className="flex gap-2">
              {period.status === "LOCKED" ? (
                <button
                  onClick={() => unlockPeriod(period)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-100 text-sm font-medium"
                >
                  <Unlock size={16} />
                  Odomknúť
                </button>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setSelectedPeriod(period);
                      setShowWizard(true);
                    }}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-slate-900 text-white rounded-xl hover:bg-slate-800 text-sm font-medium"
                  >
                    <Download size={16} />
                    Uzávierka
                  </button>
                  <button
                    onClick={() => lockPeriod(period)}
                    disabled={period.draftCount > 0}
                    className="flex items-center justify-center gap-2 px-3 py-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-100 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    title={period.draftCount > 0 ? "Najprv zaúčtujte všetky koncepty" : "Zamknúť obdobie"}
                  >
                    <Lock size={16} />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Closing Wizard Modal */}
      {showWizard && selectedPeriod && (
        <ClosingWizardModal
          period={selectedPeriod}
          onClose={() => {
            setShowWizard(false);
            setSelectedPeriod(null);
          }}
          onLock={() => {
            lockPeriod(selectedPeriod);
            setShowWizard(false);
            setSelectedPeriod(null);
          }}
        />
      )}

      {/* Validation Modal */}
      {showValidationModal && validationResult && (
        <ValidationModal
          result={validationResult}
          onClose={() => {
            setShowValidationModal(false);
            setPendingLockPeriod(null);
          }}
          onProceed={validationResult.blocks.length === 0 && pendingLockPeriod ? () => {
            setShowValidationModal(false);
            lockPeriod(pendingLockPeriod, true);
            setPendingLockPeriod(null);
          } : undefined}
        />
      )}
    </div>
  );
}

// ============================================================================
// CLOSING WIZARD MODAL
// ============================================================================

function ClosingWizardModal({
  period,
  onClose,
  onLock,
}: {
  period: PeriodSummary;
  onClose: () => void;
  onLock: () => void;
}) {
  const [step, setStep] = useState(1);
  const [checks, setChecks] = useState({
    inbox: false,
    saldokonto: false,
    bank: false,
    exported: false,
  });
  const [exporting, setExporting] = useState(false);

  const toggleCheck = (key: keyof typeof checks) => {
    setChecks({ ...checks, [key]: !checks[key] });
  };


  const exportJournal = async () => {
    setExporting(true);
    const companyId = getCompanyId();
    
    // Load transactions for this period
    const transactionsRef = collection(db, "companies", companyId, "transactions");
    const snap = await getDocs(transactionsRef);
    
    const entries: any[] = [];
    snap.docs.forEach((docSnap) => {
      const tx = docSnap.data() as Transaction;
      if (tx.period !== period.period) return;
      if (tx.status === "DRAFT") return;
      
      tx.lines.forEach((line) => {
        entries.push({
          date: tx.date.toDate().toLocaleDateString("sk-SK"),
          number: tx.number,
          description: tx.description,
          accountCode: line.accountCode,
          accountName: line.accountName,
          md: line.side === "MD" ? line.amount : "",
          d: line.side === "D" ? line.amount : "",
        });
      });
    });
    
    // Generate CSV
    const headers = ["Dátum", "Číslo", "Popis", "Účet", "Názov účtu", "MD", "D"];
    const rows = entries.map((e) => [
      e.date, e.number, e.description, e.accountCode, e.accountName,
      e.md ? e.md.toFixed(2) : "", e.d ? e.d.toFixed(2) : ""
    ]);
    
    const csv = [headers.join(";"), ...rows.map((r) => r.map((c) => `"${c}"`).join(";"))].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `uzavierka-dennik-${period.period}.csv`;
    a.click();
    
    setExporting(false);
    setChecks({ ...checks, exported: true });
  };

  const getMonthName = (month: number) => {
    const names = ["", "Január", "Február", "Marec", "Apríl", "Máj", "Jún", "Júl", "August", "September", "Október", "November", "December"];
    return names[month];
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Mesačná uzávierka</h2>
            <p className="text-slate-500">{getMonthName(period.month)} {period.year}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            ✕
          </button>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 mb-6">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`flex-1 h-2 rounded-full ${step >= s ? "bg-slate-900" : "bg-slate-200"}`}
            />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <h3 className="font-semibold text-slate-900">Krok 1: Kontrola</h3>
            <p className="text-sm text-slate-600">Skontrolujte, že všetko je v poriadku pred uzávierkou.</p>
            
            {period.draftCount > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
                <AlertTriangle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium text-amber-800">Máte {period.draftCount} nezaúčtovaných konceptov</div>
                  <div className="text-sm text-amber-700">Pred uzávierkou ich zaúčtujte alebo zmažte.</div>
                </div>
              </div>
            )}
            
            <div className="space-y-2">
              <div
                onClick={() => toggleCheck("inbox")}
                className={`p-3 rounded-xl cursor-pointer flex items-center gap-3 ${
                  checks.inbox ? "bg-emerald-50" : "bg-slate-50 hover:bg-slate-100"
                }`}
              >
                {checks.inbox ? (
                  <CheckCircle size={20} className="text-emerald-600" />
                ) : (
                  <Circle size={20} className="text-slate-400" />
                )}
                <span className={checks.inbox ? "text-emerald-700" : "text-slate-700"}>
                  Inbox dokladov skontrolovaný (0 nezaúčtovaných)
                </span>
              </div>
              
              <div
                onClick={() => toggleCheck("saldokonto")}
                className={`p-3 rounded-xl cursor-pointer flex items-center gap-3 ${
                  checks.saldokonto ? "bg-emerald-50" : "bg-slate-50 hover:bg-slate-100"
                }`}
              >
                {checks.saldokonto ? (
                  <CheckCircle size={20} className="text-emerald-600" />
                ) : (
                  <Circle size={20} className="text-slate-400" />
                )}
                <span className={checks.saldokonto ? "text-emerald-700" : "text-slate-700"}>
                  Saldokonto 311/321 skontrolované
                </span>
              </div>
              
              <div
                onClick={() => toggleCheck("bank")}
                className={`p-3 rounded-xl cursor-pointer flex items-center gap-3 ${
                  checks.bank ? "bg-emerald-50" : "bg-slate-50 hover:bg-slate-100"
                }`}
              >
                {checks.bank ? (
                  <CheckCircle size={20} className="text-emerald-600" />
                ) : (
                  <Circle size={20} className="text-slate-400" />
                )}
                <span className={checks.bank ? "text-emerald-700" : "text-slate-700"}>
                  Banka (221) skontrolovaná
                </span>
              </div>
            </div>
            
            <button
              onClick={() => setStep(2)}
              disabled={!checks.inbox || !checks.saldokonto || !checks.bank}
              className="w-full px-4 py-3 rounded-xl bg-slate-900 text-white font-medium hover:bg-slate-800 disabled:opacity-50"
            >
              Pokračovať
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h3 className="font-semibold text-slate-900">Krok 2: Export</h3>
            <p className="text-sm text-slate-600">Exportujte podklady pre archiváciu.</p>
            
            <div className="space-y-2">
              <button
                onClick={exportJournal}
                disabled={exporting}
                className="w-full p-3 rounded-xl bg-slate-50 hover:bg-slate-100 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <Download size={20} className="text-slate-600" />
                  <span>Účtovný denník (CSV)</span>
                </div>
                {checks.exported && <CheckCircle size={20} className="text-emerald-600" />}
              </button>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => setStep(1)}
                className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50"
              >
                Späť
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!checks.exported}
                className="flex-1 px-4 py-3 rounded-xl bg-slate-900 text-white font-medium hover:bg-slate-800 disabled:opacity-50"
              >
                Pokračovať
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h3 className="font-semibold text-slate-900">Krok 3: Zamknutie</h3>
            <p className="text-sm text-slate-600">Po zamknutí nebude možné upravovať transakcie v tomto období.</p>
            
            <div className="p-4 bg-slate-50 rounded-xl">
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Obdobie</span>
                  <span className="font-medium">{period.period}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Transakcií</span>
                  <span className="font-medium">{period.transactionCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Obrat</span>
                  <span className="font-mono">{formatEUR(period.totalMd)}</span>
                </div>
              </div>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => setStep(2)}
                className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50"
              >
                Späť
              </button>
              <button
                onClick={onLock}
                disabled={period.draftCount > 0}
                className="flex-1 px-4 py-3 rounded-xl bg-slate-900 text-white font-medium hover:bg-slate-800 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Lock size={18} />
                Zamknúť obdobie
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
