// src/pages/accounting/GeneralLedger.tsx
import { useState, useEffect } from "react";
import { Search, Download } from "lucide-react";
import { db } from "@/firebase";
import { collection, getDocs } from "firebase/firestore";
import { useUser } from "@/components/AuthGate";
import type { Transaction, Account } from "@/lib/accountingSchemas";

function getCompanyId(): string {
  const stored = localStorage.getItem("gpcs-company-id");
  return stored || "gpcs";
}

function formatEUR(amount: number): string {
  return new Intl.NumberFormat("sk-SK", { style: "currency", currency: "EUR" }).format(amount);
}

interface AccountSummary {
  code: string;
  name: string;
  type: string;
  openingBalance: number;
  debitTurnover: number;
  creditTurnover: number;
  closingBalance: number;
}

export default function GeneralLedger() {
  useUser();
  const [, setAccounts] = useState<Account[]>([]);
  const [summaries, setSummaries] = useState<AccountSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodFilter, setPeriodFilter] = useState<string>(new Date().toISOString().slice(0, 7));
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadData();
  }, [periodFilter]);

  async function loadData() {
    setLoading(true);
    const companyId = getCompanyId();
    
    // Load accounts
    const accountsRef = collection(db, "companies", companyId, "chartOfAccounts");
    const accountsSnap = await getDocs(accountsRef);
    const loadedAccounts = accountsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Account));
    setAccounts(loadedAccounts);
    
    // Load transactions
    const transactionsRef = collection(db, "companies", companyId, "transactions");
    const transactionsSnap = await getDocs(transactionsRef);
    
    // Calculate summaries per account
    const accountMap = new Map<string, AccountSummary>();
    
    // Initialize with all accounts
    loadedAccounts.forEach((acc) => {
      accountMap.set(acc.code, {
        code: acc.code,
        name: acc.name,
        type: acc.type,
        openingBalance: 0,
        debitTurnover: 0,
        creditTurnover: 0,
        closingBalance: 0,
      });
    });
    
    // Process transactions
    transactionsSnap.docs.forEach((doc) => {
      const transaction = { id: doc.id, ...doc.data() } as Transaction;
      
      // Only include POSTED or LOCKED transactions
      if (transaction.status === "DRAFT") return;
      
      // Filter by period
      if (periodFilter && transaction.period !== periodFilter) return;
      
      transaction.lines.forEach((line) => {
        let summary = accountMap.get(line.accountCode);
        if (!summary) {
          summary = {
            code: line.accountCode,
            name: line.accountName,
            type: "UNKNOWN",
            openingBalance: 0,
            debitTurnover: 0,
            creditTurnover: 0,
            closingBalance: 0,
          };
          accountMap.set(line.accountCode, summary);
        }
        
        if (line.side === "MD") {
          summary.debitTurnover += line.amount;
        } else {
          summary.creditTurnover += line.amount;
        }
      });
    });
    
    // Calculate closing balances
    accountMap.forEach((summary) => {
      const account = loadedAccounts.find((a) => a.code === summary.code);
      if (account?.normalSide === "MD") {
        summary.closingBalance = summary.openingBalance + summary.debitTurnover - summary.creditTurnover;
      } else {
        summary.closingBalance = summary.openingBalance + summary.creditTurnover - summary.debitTurnover;
      }
    });
    
    // Convert to array and sort
    const summaryArray = Array.from(accountMap.values())
      .filter((s) => s.debitTurnover > 0 || s.creditTurnover > 0)
      .sort((a, b) => a.code.localeCompare(b.code));
    
    setSummaries(summaryArray);
    setLoading(false);
  }

  const filteredSummaries = summaries.filter((s) => {
    return (
      s.code.includes(searchQuery) ||
      s.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  // Calculate totals
  const totalDebit = filteredSummaries.reduce((sum, s) => sum + s.debitTurnover, 0);
  const totalCredit = filteredSummaries.reduce((sum, s) => sum + s.creditTurnover, 0);

  const exportCSV = () => {
    const headers = ["Účet", "Názov", "Typ", "Počiatočný stav", "Obrat MD", "Obrat D", "Konečný stav"];
    const rows = filteredSummaries.map((s) => [
      s.code,
      s.name,
      s.type,
      s.openingBalance.toFixed(2),
      s.debitTurnover.toFixed(2),
      s.creditTurnover.toFixed(2),
      s.closingBalance.toFixed(2),
    ]);
    
    const csv = [headers.join(";"), ...rows.map((r) => r.map((c) => `"${c}"`).join(";"))].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hlavna-kniha-${periodFilter}.csv`;
    a.click();
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "ASSET": return "Aktíva";
      case "LIABILITY": return "Pasíva";
      case "EQUITY": return "Vlastné imanie";
      case "REVENUE": return "Výnosy";
      case "EXPENSE": return "Náklady";
      default: return type;
    }
  };

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
          <h1 className="text-2xl font-bold text-slate-900">Hlavná kniha</h1>
          <p className="text-slate-500">Agregovaný prehľad obratov a zostatkov po účtoch</p>
        </div>
        <button
          onClick={exportCSV}
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors"
        >
          <Download size={20} />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Hľadať účet..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
            />
          </div>
          <input
            type="month"
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
          />
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-100">
          <div className="text-sm text-slate-500">Počet účtov s pohybom</div>
          <div className="text-2xl font-bold text-slate-900">{filteredSummaries.length}</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-100">
          <div className="text-sm text-slate-500">Celkový obrat MD</div>
          <div className="text-2xl font-bold text-slate-900">{formatEUR(totalDebit)}</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-100">
          <div className="text-sm text-slate-500">Celkový obrat D</div>
          <div className="text-2xl font-bold text-slate-900">{formatEUR(totalCredit)}</div>
        </div>
      </div>

      {/* Ledger table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50">
                <th className="text-left text-xs font-medium text-slate-500 uppercase px-6 py-3">Účet</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase px-6 py-3">Názov</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase px-6 py-3">Typ</th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase px-6 py-3">Obrat MD</th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase px-6 py-3">Obrat D</th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase px-6 py-3">Zostatok</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSummaries.map((summary) => (
                <tr key={summary.code} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <span className="font-mono font-semibold text-slate-900">{summary.code}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {summary.name}
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600">
                      {getTypeLabel(summary.type)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-sm">
                    {formatEUR(summary.debitTurnover)}
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-sm">
                    {formatEUR(summary.creditTurnover)}
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-sm font-semibold">
                    <span className={summary.closingBalance < 0 ? "text-rose-600" : ""}>
                      {formatEUR(summary.closingBalance)}
                    </span>
                  </td>
                </tr>
              ))}
              {filteredSummaries.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    Žiadne účty s pohybom v tomto období
                  </td>
                </tr>
              )}
            </tbody>
            {filteredSummaries.length > 0 && (
              <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                <tr className="font-semibold">
                  <td colSpan={3} className="px-6 py-3 text-right text-sm">Súčet:</td>
                  <td className="px-6 py-3 text-right font-mono text-sm">{formatEUR(totalDebit)}</td>
                  <td className="px-6 py-3 text-right font-mono text-sm">{formatEUR(totalCredit)}</td>
                  <td className="px-6 py-3"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
