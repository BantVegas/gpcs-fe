// src/pages/accounting/Payroll.tsx
import { useState, useEffect } from "react";
import { Check, Settings, Plus, Eye } from "lucide-react";
import { db } from "@/firebase";
import { collection, doc, getDocs, getDoc, setDoc, Timestamp } from "firebase/firestore";
import { useUser } from "@/components/AuthGate";
import type { PayrollRun, PayrollConfig } from "@/lib/accountingSchemas";
import { DEFAULT_PAYROLL_CONFIG } from "@/lib/accountingSchemas";

function getCompanyId(): string {
  const stored = localStorage.getItem("gpcs-company-id");
  return stored || "gpcs";
}

function formatEUR(amount: number): string {
  return new Intl.NumberFormat("sk-SK", { style: "currency", currency: "EUR" }).format(amount);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export default function Payroll() {
  const user = useUser();
  const [config, setConfig] = useState<PayrollConfig>(DEFAULT_PAYROLL_CONFIG);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showNewRun, setShowNewRun] = useState(false);
  const [selectedRun, setSelectedRun] = useState<PayrollRun | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const companyId = getCompanyId();
    
    // Load payroll config
    const configRef = doc(db, "companies", companyId, "settings", "payroll");
    const configSnap = await getDoc(configRef);
    if (configSnap.exists()) {
      setConfig(configSnap.data() as PayrollConfig);
    } else {
      // Initialize with defaults
      await setDoc(configRef, DEFAULT_PAYROLL_CONFIG);
    }
    
    // Load payroll runs
    const runsRef = collection(db, "companies", companyId, "payroll");
    const runsSnap = await getDocs(runsRef);
    const loadedRuns = runsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as PayrollRun));
    loadedRuns.sort((a, b) => b.period.localeCompare(a.period));
    setRuns(loadedRuns);
    
    setLoading(false);
  }

  async function saveConfig(newConfig: PayrollConfig) {
    const companyId = getCompanyId();
    const configRef = doc(db, "companies", companyId, "settings", "payroll");
    await setDoc(configRef, newConfig);
    setConfig(newConfig);
    setShowSettings(false);
  }

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
          <h1 className="text-2xl font-bold text-slate-900">Mzdy</h1>
          <p className="text-slate-500">Mesačné spracovanie mzdy pre 1 zamestnanca</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors"
          >
            <Settings size={20} />
            Nastavenia
          </button>
          <button
            onClick={() => setShowNewRun(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors"
          >
            <Plus size={20} />
            Nový výpočet
          </button>
        </div>
      </div>

      {/* Current config summary */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
        <h3 className="font-semibold text-slate-900 mb-3">Aktuálne sadzby ({config.year})</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-slate-500">ZP zamestnanec</div>
            <div className="font-semibold">{formatPercent(config.healthInsuranceEmployee)}</div>
          </div>
          <div>
            <div className="text-slate-500">SP zamestnanec</div>
            <div className="font-semibold">{formatPercent(config.socialInsuranceEmployee)}</div>
          </div>
          <div>
            <div className="text-slate-500">ZP zamestnávateľ</div>
            <div className="font-semibold">{formatPercent(config.healthInsuranceEmployer)}</div>
          </div>
          <div>
            <div className="text-slate-500">SP zamestnávateľ</div>
            <div className="font-semibold">{formatPercent(config.socialInsuranceEmployer)}</div>
          </div>
        </div>
      </div>

      {/* Payroll runs list */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">História mzdových výpočtov</h3>
        </div>
        <div className="divide-y divide-slate-100">
          {runs.map((run) => (
            <div
              key={run.id}
              className="px-6 py-4 hover:bg-slate-50 cursor-pointer"
              onClick={() => setSelectedRun(run)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-900">{run.period}</div>
                  <div className="text-sm text-slate-500">{run.employeeName}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-slate-900">{formatEUR(run.grossSalary)}</div>
                  <div className="text-sm text-slate-500">hrubá mzda</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-emerald-600">{formatEUR(run.netSalary)}</div>
                  <div className="text-sm text-slate-500">čistá mzda</div>
                </div>
                <div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    run.status === "PAID" ? "bg-emerald-100 text-emerald-700" :
                    run.status === "PROCESSED" ? "bg-blue-100 text-blue-700" :
                    "bg-amber-100 text-amber-700"
                  }`}>
                    {run.status === "PAID" ? "Uhradené" : run.status === "PROCESSED" ? "Spracované" : "Koncept"}
                  </span>
                </div>
                <Eye size={20} className="text-slate-400" />
              </div>
            </div>
          ))}
          {runs.length === 0 && (
            <div className="px-6 py-12 text-center text-slate-500">
              Zatiaľ žiadne mzdové výpočty
            </div>
          )}
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <PayrollSettingsModal
          config={config}
          onClose={() => setShowSettings(false)}
          onSave={saveConfig}
        />
      )}

      {/* New Run Modal */}
      {showNewRun && (
        <NewPayrollRunModal
          config={config}
          userId={user?.uid || ""}
          onClose={() => setShowNewRun(false)}
          onSuccess={() => {
            setShowNewRun(false);
            loadData();
          }}
        />
      )}

      {/* Run Detail Modal */}
      {selectedRun && (
        <PayrollRunDetailModal
          run={selectedRun}
          onClose={() => setSelectedRun(null)}
        />
      )}
    </div>
  );
}

// ============================================================================
// PAYROLL SETTINGS MODAL
// ============================================================================

function PayrollSettingsModal({
  config,
  onClose,
  onSave,
}: {
  config: PayrollConfig;
  onClose: () => void;
  onSave: (config: PayrollConfig) => void;
}) {
  const [formData, setFormData] = useState<PayrollConfig>(config);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(formData);
    setSaving(false);
  };

  const updateField = (field: keyof PayrollConfig, value: number) => {
    setFormData({ ...formData, [field]: value });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-slate-900 mb-6">Nastavenia miezd</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Rok</label>
            <input
              type="number"
              value={formData.year}
              onChange={(e) => updateField("year", parseInt(e.target.value))}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
            />
          </div>

          <div className="border-t border-slate-200 pt-4">
            <h3 className="font-medium text-slate-900 mb-3">Odvody zamestnanca</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-600 mb-1">Zdravotné poistenie (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={(formData.healthInsuranceEmployee * 100).toFixed(1)}
                  onChange={(e) => updateField("healthInsuranceEmployee", parseFloat(e.target.value) / 100)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">Sociálne poistenie (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={(formData.socialInsuranceEmployee * 100).toFixed(1)}
                  onChange={(e) => updateField("socialInsuranceEmployee", parseFloat(e.target.value) / 100)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4">
            <h3 className="font-medium text-slate-900 mb-3">Odvody zamestnávateľa</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-600 mb-1">Zdravotné poistenie (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={(formData.healthInsuranceEmployer * 100).toFixed(1)}
                  onChange={(e) => updateField("healthInsuranceEmployer", parseFloat(e.target.value) / 100)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">Sociálne poistenie (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={(formData.socialInsuranceEmployer * 100).toFixed(1)}
                  onChange={(e) => updateField("socialInsuranceEmployer", parseFloat(e.target.value) / 100)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4">
            <h3 className="font-medium text-slate-900 mb-3">Daň z príjmov</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-600 mb-1">Sadzba dane (%)</label>
                <input
                  type="number"
                  step="1"
                  value={(formData.incomeTaxRate * 100).toFixed(0)}
                  onChange={(e) => updateField("incomeTaxRate", parseFloat(e.target.value) / 100)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">Nezdaniteľná časť (€/rok)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.taxFreeAmount}
                  onChange={(e) => updateField("taxFreeAmount", parseFloat(e.target.value))}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50"
            >
              Zrušiť
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-4 py-3 rounded-xl bg-slate-900 text-white font-medium hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? "Ukladám..." : "Uložiť"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// NEW PAYROLL RUN MODAL
// ============================================================================

function NewPayrollRunModal({
  config,
  userId,
  onClose,
  onSuccess,
}: {
  config: PayrollConfig;
  userId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [employeeName, setEmployeeName] = useState("Zamestnanec");
  const [grossSalary, setGrossSalary] = useState(1500);

  // Calculate values
  const healthEmployee = Math.round(grossSalary * config.healthInsuranceEmployee * 100) / 100;
  const socialEmployee = Math.round(grossSalary * config.socialInsuranceEmployee * 100) / 100;
  const totalEmployeeDeductions = healthEmployee + socialEmployee;
  
  // Tax base = gross - employee deductions
  const taxBase = grossSalary - totalEmployeeDeductions;
  // Monthly tax-free amount
  const monthlyTaxFree = config.taxFreeAmount / 12;
  // Taxable amount
  const taxableAmount = Math.max(0, taxBase - monthlyTaxFree);
  // Tax advance
  const taxAdvance = Math.round(taxableAmount * config.incomeTaxRate * 100) / 100;
  
  // Net salary
  const netSalary = Math.round((grossSalary - totalEmployeeDeductions - taxAdvance) * 100) / 100;
  
  // Employer contributions
  const healthEmployer = Math.round(grossSalary * config.healthInsuranceEmployer * 100) / 100;
  const socialEmployer = Math.round(grossSalary * config.socialInsuranceEmployer * 100) / 100;
  const totalEmployerCost = grossSalary + healthEmployer + socialEmployer;

  // Total insurance (employee + employer)
  const totalHealth = healthEmployee + healthEmployer;
  const totalSocial = socialEmployee + socialEmployer;

  const handleCreate = async () => {
    setSaving(true);
    const companyId = getCompanyId();
    const now = Timestamp.now();
    
    try {
      const transactionIds: string[] = [];
      const periodDate = new Date(period + "-15"); // 15th of the month

      // Transaction 1: Mzda náklad (521/331, 524/336, 331/336, 331/342)
      // This is complex - we'll create it manually
      const transactionsRef = collection(db, "companies", companyId, "transactions");
      
      // Generate transaction number
      const snap = await getDocs(transactionsRef);
      const nextNum = snap.size + 1;
      const txNumber = (offset: number) => `TRN-${period.replace("-", "")}-${String(nextNum + offset).padStart(4, "0")}`;

      // Transaction 1: Mzdový náklad
      const tx1Ref = doc(transactionsRef);
      await setDoc(tx1Ref, {
        id: tx1Ref.id,
        number: txNumber(0),
        date: Timestamp.fromDate(periodDate),
        description: `Mzda ${period} - ${employeeName}`,
        lines: [
          { id: "1", accountCode: "521", accountName: "Mzdové náklady", side: "MD", amount: grossSalary, description: "Hrubá mzda" },
          { id: "2", accountCode: "524", accountName: "Zákonné sociálne poistenie", side: "MD", amount: healthEmployer + socialEmployer, description: "Odvody zamestnávateľa" },
          { id: "3", accountCode: "331", accountName: "Zamestnanci", side: "D", amount: netSalary, description: "Čistá mzda" },
          { id: "4", accountCode: "336", accountName: "Zúčtovanie s orgánmi SP a ZP", side: "D", amount: totalHealth + totalSocial, description: "Odvody SP+ZP" },
          { id: "5", accountCode: "342", accountName: "Ostatné priame dane", side: "D", amount: taxAdvance, description: "Preddavok na daň" },
        ],
        totalMd: grossSalary + healthEmployer + socialEmployer,
        totalD: netSalary + totalHealth + totalSocial + taxAdvance,
        status: "POSTED",
        period,
        createdAt: now,
        updatedAt: now,
        createdBy: userId,
        postedAt: now,
        postedBy: userId,
      });
      transactionIds.push(tx1Ref.id);

      // Transaction 2: Výplata mzdy (331/221)
      const tx2Ref = doc(transactionsRef);
      await setDoc(tx2Ref, {
        id: tx2Ref.id,
        number: txNumber(1),
        date: Timestamp.fromDate(periodDate),
        description: `Výplata mzdy ${period} - ${employeeName}`,
        lines: [
          { id: "1", accountCode: "331", accountName: "Zamestnanci", side: "MD", amount: netSalary, description: "Zúčtovanie záväzku" },
          { id: "2", accountCode: "221", accountName: "Bankové účty", side: "D", amount: netSalary, description: "Výdaj z účtu" },
        ],
        totalMd: netSalary,
        totalD: netSalary,
        status: "POSTED",
        period,
        createdAt: now,
        updatedAt: now,
        createdBy: userId,
        postedAt: now,
        postedBy: userId,
      });
      transactionIds.push(tx2Ref.id);

      // Transaction 3: Úhrada odvodov (336/221)
      const tx3Ref = doc(transactionsRef);
      await setDoc(tx3Ref, {
        id: tx3Ref.id,
        number: txNumber(2),
        date: Timestamp.fromDate(periodDate),
        description: `Úhrada odvodov SP+ZP ${period}`,
        lines: [
          { id: "1", accountCode: "336", accountName: "Zúčtovanie s orgánmi SP a ZP", side: "MD", amount: totalHealth + totalSocial, description: "Zúčtovanie záväzku" },
          { id: "2", accountCode: "221", accountName: "Bankové účty", side: "D", amount: totalHealth + totalSocial, description: "Výdaj z účtu" },
        ],
        totalMd: totalHealth + totalSocial,
        totalD: totalHealth + totalSocial,
        status: "POSTED",
        period,
        createdAt: now,
        updatedAt: now,
        createdBy: userId,
        postedAt: now,
        postedBy: userId,
      });
      transactionIds.push(tx3Ref.id);

      // Transaction 4: Úhrada dane (342/221)
      const tx4Ref = doc(transactionsRef);
      await setDoc(tx4Ref, {
        id: tx4Ref.id,
        number: txNumber(3),
        date: Timestamp.fromDate(periodDate),
        description: `Úhrada preddavku dane ${period}`,
        lines: [
          { id: "1", accountCode: "342", accountName: "Ostatné priame dane", side: "MD", amount: taxAdvance, description: "Zúčtovanie záväzku" },
          { id: "2", accountCode: "221", accountName: "Bankové účty", side: "D", amount: taxAdvance, description: "Výdaj z účtu" },
        ],
        totalMd: taxAdvance,
        totalD: taxAdvance,
        status: "POSTED",
        period,
        createdAt: now,
        updatedAt: now,
        createdBy: userId,
        postedAt: now,
        postedBy: userId,
      });
      transactionIds.push(tx4Ref.id);

      // Create payroll run record
      const payrollRef = collection(db, "companies", companyId, "payroll");
      const runRef = doc(payrollRef);
      await setDoc(runRef, {
        id: runRef.id,
        period,
        employeeName,
        grossSalary,
        healthInsuranceEmployee: healthEmployee,
        socialInsuranceEmployee: socialEmployee,
        incomeTaxAdvance: taxAdvance,
        netSalary,
        healthInsuranceEmployer: healthEmployer,
        socialInsuranceEmployer: socialEmployer,
        totalEmployerCost,
        transactionIds,
        status: "PROCESSED",
        createdAt: now,
        updatedAt: now,
        createdBy: userId,
      });

      onSuccess();
    } catch (err) {
      console.error("Payroll creation failed:", err);
      alert("Nepodarilo sa vytvoriť mzdový výpočet");
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-slate-900 mb-6">Nový mzdový výpočet</h2>

        <div className="space-y-6">
          {/* Input */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Obdobie</label>
              <input
                type="month"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Zamestnanec</label>
              <input
                type="text"
                value={employeeName}
                onChange={(e) => setEmployeeName(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Hrubá mzda (€)</label>
              <input
                type="number"
                value={grossSalary}
                onChange={(e) => setGrossSalary(parseFloat(e.target.value) || 0)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
              />
            </div>
          </div>

          {/* Calculation preview */}
          <div className="bg-slate-50 rounded-xl p-4">
            <h3 className="font-semibold text-slate-900 mb-4">Výpočet</h3>
            
            <div className="grid grid-cols-2 gap-6">
              {/* Employee side */}
              <div>
                <h4 className="text-sm font-medium text-slate-600 mb-2">Zamestnanec</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Hrubá mzda</span>
                    <span className="font-mono">{formatEUR(grossSalary)}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>− ZP ({formatPercent(config.healthInsuranceEmployee)})</span>
                    <span className="font-mono">−{formatEUR(healthEmployee)}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>− SP ({formatPercent(config.socialInsuranceEmployee)})</span>
                    <span className="font-mono">−{formatEUR(socialEmployee)}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>− Preddavok daň ({formatPercent(config.incomeTaxRate)})</span>
                    <span className="font-mono">−{formatEUR(taxAdvance)}</span>
                  </div>
                  <div className="flex justify-between font-semibold border-t border-slate-200 pt-2">
                    <span>Čistá mzda</span>
                    <span className="font-mono text-emerald-600">{formatEUR(netSalary)}</span>
                  </div>
                </div>
              </div>

              {/* Employer side */}
              <div>
                <h4 className="text-sm font-medium text-slate-600 mb-2">Zamestnávateľ</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Hrubá mzda</span>
                    <span className="font-mono">{formatEUR(grossSalary)}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>+ ZP ({formatPercent(config.healthInsuranceEmployer)})</span>
                    <span className="font-mono">+{formatEUR(healthEmployer)}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>+ SP ({formatPercent(config.socialInsuranceEmployer)})</span>
                    <span className="font-mono">+{formatEUR(socialEmployer)}</span>
                  </div>
                  <div className="flex justify-between font-semibold border-t border-slate-200 pt-2">
                    <span>Celkový náklad</span>
                    <span className="font-mono text-rose-600">{formatEUR(totalEmployerCost)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Transactions preview */}
          <div className="bg-blue-50 rounded-xl p-4">
            <h3 className="font-semibold text-blue-900 mb-3">Vytvorené transakcie</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Check size={16} className="text-blue-600" />
                <span>Mzda náklad: MD 521 {formatEUR(grossSalary)}, MD 524 {formatEUR(healthEmployer + socialEmployer)} / D 331, 336, 342</span>
              </div>
              <div className="flex items-center gap-2">
                <Check size={16} className="text-blue-600" />
                <span>Výplata mzdy: MD 331 / D 221 {formatEUR(netSalary)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Check size={16} className="text-blue-600" />
                <span>Úhrada odvodov: MD 336 / D 221 {formatEUR(totalHealth + totalSocial)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Check size={16} className="text-blue-600" />
                <span>Úhrada dane: MD 342 / D 221 {formatEUR(taxAdvance)}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50"
            >
              Zrušiť
            </button>
            <button
              onClick={handleCreate}
              disabled={saving || grossSalary <= 0}
              className="flex-1 px-4 py-3 rounded-xl bg-slate-900 text-white font-medium hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? "Vytváram..." : "Vytvoriť a zaúčtovať"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// PAYROLL RUN DETAIL MODAL
// ============================================================================

function PayrollRunDetailModal({
  run,
  onClose,
}: {
  run: PayrollRun;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-slate-900 mb-6">Mzdový výpočet {run.period}</h2>

        <div className="space-y-4">
          <div className="bg-slate-50 rounded-xl p-4">
            <div className="text-sm text-slate-500 mb-1">Zamestnanec</div>
            <div className="font-semibold text-slate-900">{run.employeeName}</div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 rounded-xl p-4">
              <div className="text-sm text-slate-500 mb-1">Hrubá mzda</div>
              <div className="text-xl font-bold text-slate-900">{formatEUR(run.grossSalary)}</div>
            </div>
            <div className="bg-emerald-50 rounded-xl p-4">
              <div className="text-sm text-emerald-600 mb-1">Čistá mzda</div>
              <div className="text-xl font-bold text-emerald-700">{formatEUR(run.netSalary)}</div>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4">
            <h3 className="font-medium text-slate-900 mb-3">Odvody zamestnanca</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Zdravotné poistenie</span>
                <span className="font-mono">{formatEUR(run.healthInsuranceEmployee)}</span>
              </div>
              <div className="flex justify-between">
                <span>Sociálne poistenie</span>
                <span className="font-mono">{formatEUR(run.socialInsuranceEmployee)}</span>
              </div>
              <div className="flex justify-between">
                <span>Preddavok na daň</span>
                <span className="font-mono">{formatEUR(run.incomeTaxAdvance)}</span>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4">
            <h3 className="font-medium text-slate-900 mb-3">Odvody zamestnávateľa</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Zdravotné poistenie</span>
                <span className="font-mono">{formatEUR(run.healthInsuranceEmployer)}</span>
              </div>
              <div className="flex justify-between">
                <span>Sociálne poistenie</span>
                <span className="font-mono">{formatEUR(run.socialInsuranceEmployer)}</span>
              </div>
              <div className="flex justify-between font-semibold border-t border-slate-200 pt-2 mt-2">
                <span>Celkový náklad zamestnávateľa</span>
                <span className="font-mono">{formatEUR(run.totalEmployerCost)}</span>
              </div>
            </div>
          </div>

          <div className="text-sm text-slate-500">
            Vytvorené transakcie: {run.transactionIds.length}
          </div>

          <button
            onClick={onClose}
            className="w-full px-4 py-3 rounded-xl bg-slate-900 text-white font-medium hover:bg-slate-800"
          >
            Zavrieť
          </button>
        </div>
      </div>
    </div>
  );
}
