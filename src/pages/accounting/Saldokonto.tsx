// src/pages/accounting/Saldokonto.tsx
import { useState, useEffect } from "react";
import { Search, Download, AlertCircle } from "lucide-react";
import { db } from "@/firebase";
import { collection, getDocs } from "firebase/firestore";
import { useUser } from "@/components/AuthGate";
import type { Transaction } from "@/lib/accountingSchemas";

function getCompanyId(): string {
  const stored = localStorage.getItem("gpcs-company-id");
  return stored || "gpcs";
}

function formatEUR(amount: number): string {
  return new Intl.NumberFormat("sk-SK", { style: "currency", currency: "EUR" }).format(amount);
}

interface PartnerBalance {
  partnerId: string;
  partnerName: string;
  accountCode: string;
  debitTotal: number;
  creditTotal: number;
  balance: number;
}

export default function Saldokonto() {
  useUser();
  const [balances, setBalances] = useState<PartnerBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [accountFilter, setAccountFilter] = useState<"311" | "321" | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showOnlyUnpaid, setShowOnlyUnpaid] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const companyId = getCompanyId();
    
    // Load transactions
    const transactionsRef = collection(db, "companies", companyId, "transactions");
    const transactionsSnap = await getDocs(transactionsRef);
    
    // Calculate balances per partner per account
    const balanceMap = new Map<string, PartnerBalance>();
    
    transactionsSnap.docs.forEach((doc) => {
      const transaction = { id: doc.id, ...doc.data() } as Transaction;
      
      // Only include POSTED or LOCKED transactions
      if (transaction.status === "DRAFT") return;
      
      transaction.lines.forEach((line) => {
        // Only process 311 (receivables) and 321 (payables)
        if (line.accountCode !== "311" && line.accountCode !== "321") return;
        if (!line.partnerId) return;
        
        const key = `${line.partnerId}-${line.accountCode}`;
        let balance = balanceMap.get(key);
        
        if (!balance) {
          balance = {
            partnerId: line.partnerId,
            partnerName: line.partnerName || "Neznámy partner",
            accountCode: line.accountCode,
            debitTotal: 0,
            creditTotal: 0,
            balance: 0,
          };
          balanceMap.set(key, balance);
        }
        
        if (line.side === "MD") {
          balance.debitTotal += line.amount;
        } else {
          balance.creditTotal += line.amount;
        }
      });
    });
    
    // Calculate final balances
    balanceMap.forEach((balance) => {
      if (balance.accountCode === "311") {
        // Receivables: MD increases, D decreases
        balance.balance = balance.debitTotal - balance.creditTotal;
      } else {
        // Payables: D increases, MD decreases
        balance.balance = balance.creditTotal - balance.debitTotal;
      }
    });
    
    const balanceArray = Array.from(balanceMap.values())
      .sort((a, b) => a.partnerName.localeCompare(b.partnerName));
    
    setBalances(balanceArray);
    setLoading(false);
  }

  const filteredBalances = balances.filter((b) => {
    const matchesAccount = accountFilter === "all" || b.accountCode === accountFilter;
    const matchesSearch = b.partnerName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesUnpaid = !showOnlyUnpaid || b.balance !== 0;
    return matchesAccount && matchesSearch && matchesUnpaid;
  });

  // Calculate totals
  const total311 = filteredBalances
    .filter((b) => b.accountCode === "311")
    .reduce((sum, b) => sum + b.balance, 0);
  const total321 = filteredBalances
    .filter((b) => b.accountCode === "321")
    .reduce((sum, b) => sum + b.balance, 0);

  const exportCSV = () => {
    const headers = ["Partner", "Účet", "Obrat MD", "Obrat D", "Zostatok"];
    const rows = filteredBalances.map((b) => [
      b.partnerName,
      b.accountCode,
      b.debitTotal.toFixed(2),
      b.creditTotal.toFixed(2),
      b.balance.toFixed(2),
    ]);
    
    const csv = [headers.join(";"), ...rows.map((r) => r.map((c) => `"${c}"`).join(";"))].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `saldokonto.csv`;
    a.click();
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
          <h1 className="text-2xl font-bold text-slate-900">Saldokonto</h1>
          <p className="text-slate-500">Prehľad pohľadávok (311) a záväzkov (321) po partneroch</p>
        </div>
        <button
          onClick={exportCSV}
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors"
        >
          <Download size={20} />
          Export CSV
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-500">Pohľadávky (311)</span>
            <span className="font-mono text-sm bg-blue-100 text-blue-700 px-2 py-0.5 rounded">311</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">{formatEUR(total311)}</div>
          <div className="text-sm text-slate-500 mt-1">
            {filteredBalances.filter((b) => b.accountCode === "311" && b.balance > 0).length} neuhradených
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-500">Záväzky (321)</span>
            <span className="font-mono text-sm bg-purple-100 text-purple-700 px-2 py-0.5 rounded">321</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">{formatEUR(total321)}</div>
          <div className="text-sm text-slate-500 mt-1">
            {filteredBalances.filter((b) => b.accountCode === "321" && b.balance > 0).length} neuhradených
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Hľadať partnera..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
            />
          </div>
          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value as "311" | "321" | "all")}
            className="px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
          >
            <option value="all">Všetky účty</option>
            <option value="311">311 - Pohľadávky</option>
            <option value="321">321 - Záväzky</option>
          </select>
          <label className="flex items-center gap-2 px-4 py-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showOnlyUnpaid}
              onChange={(e) => setShowOnlyUnpaid(e.target.checked)}
              className="rounded border-slate-300"
            />
            <span className="text-sm text-slate-700">Len neuhradené</span>
          </label>
        </div>
      </div>

      {/* Balances table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50">
                <th className="text-left text-xs font-medium text-slate-500 uppercase px-6 py-3">Partner</th>
                <th className="text-center text-xs font-medium text-slate-500 uppercase px-6 py-3">Účet</th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase px-6 py-3">Obrat MD</th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase px-6 py-3">Obrat D</th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase px-6 py-3">Zostatok</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredBalances.map((balance) => (
                <tr key={`${balance.partnerId}-${balance.accountCode}`} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900">{balance.partnerName}</div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`font-mono text-sm px-2 py-1 rounded ${
                      balance.accountCode === "311" 
                        ? "bg-blue-100 text-blue-700" 
                        : "bg-purple-100 text-purple-700"
                    }`}>
                      {balance.accountCode}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-sm">
                    {formatEUR(balance.debitTotal)}
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-sm">
                    {formatEUR(balance.creditTotal)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className={`font-mono text-sm font-semibold ${
                      balance.balance > 0 ? "text-amber-600" : balance.balance < 0 ? "text-rose-600" : "text-emerald-600"
                    }`}>
                      {formatEUR(balance.balance)}
                    </span>
                    {balance.balance > 0 && (
                      <AlertCircle size={14} className="inline ml-1 text-amber-500" />
                    )}
                  </td>
                </tr>
              ))}
              {filteredBalances.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    {showOnlyUnpaid ? "Všetky položky sú uhradené" : "Žiadne záznamy"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
