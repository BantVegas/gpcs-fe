// src/pages/accounting/Journal.tsx
import { useState, useEffect } from "react";
import { Search, Download } from "lucide-react";
import { db } from "@/firebase";
import { collection, getDocs, Timestamp } from "firebase/firestore";
import { useUser } from "@/components/AuthGate";
import type { Transaction, TransactionLine } from "@/lib/accountingSchemas";

function getCompanyId(): string {
  const stored = localStorage.getItem("gpcs-company-id");
  return stored || "gpcs";
}

function formatDate(ts: Timestamp): string {
  return ts.toDate().toLocaleDateString("sk-SK");
}

function formatEUR(amount: number): string {
  return new Intl.NumberFormat("sk-SK", { style: "currency", currency: "EUR" }).format(amount);
}

interface JournalEntry {
  transactionId: string;
  transactionNumber: string;
  date: Timestamp;
  description: string;
  line: TransactionLine;
}

export default function Journal() {
  useUser();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodFilter, setPeriodFilter] = useState<string>(new Date().toISOString().slice(0, 7));
  const [searchQuery, setSearchQuery] = useState("");
  const [accountFilter, setAccountFilter] = useState<string>("");

  useEffect(() => {
    loadJournal();
  }, [periodFilter]);

  async function loadJournal() {
    setLoading(true);
    const companyId = getCompanyId();
    const transactionsRef = collection(db, "companies", companyId, "transactions");
    const snap = await getDocs(transactionsRef);
    
    const journalEntries: JournalEntry[] = [];
    
    snap.docs.forEach((doc) => {
      const transaction = { id: doc.id, ...doc.data() } as Transaction;
      
      // Only include POSTED or LOCKED transactions
      if (transaction.status === "DRAFT") return;
      
      // Filter by period
      if (periodFilter && transaction.period !== periodFilter) return;
      
      // Add each line as a journal entry
      transaction.lines.forEach((line) => {
        journalEntries.push({
          transactionId: transaction.id,
          transactionNumber: transaction.number,
          date: transaction.date,
          description: transaction.description,
          line,
        });
      });
    });
    
    // Sort by date, then by transaction number
    journalEntries.sort((a, b) => {
      const dateA = a.date instanceof Timestamp ? a.date.toDate() : new Date();
      const dateB = b.date instanceof Timestamp ? b.date.toDate() : new Date();
      if (dateA.getTime() !== dateB.getTime()) {
        return dateA.getTime() - dateB.getTime();
      }
      return a.transactionNumber.localeCompare(b.transactionNumber);
    });
    
    setEntries(journalEntries);
    setLoading(false);
  }

  const filteredEntries = entries.filter((entry) => {
    const matchesSearch = 
      entry.transactionNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      entry.line.accountCode.includes(searchQuery) ||
      entry.line.accountName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesAccount = !accountFilter || entry.line.accountCode === accountFilter;
    return matchesSearch && matchesAccount;
  });

  // Get unique accounts for filter
  const uniqueAccounts = [...new Set(entries.map((e) => e.line.accountCode))].sort();

  // Calculate totals
  const totalMd = filteredEntries
    .filter((e) => e.line.side === "MD")
    .reduce((sum, e) => sum + e.line.amount, 0);
  const totalD = filteredEntries
    .filter((e) => e.line.side === "D")
    .reduce((sum, e) => sum + e.line.amount, 0);

  const exportCSV = () => {
    const headers = ["Dátum", "Číslo", "Popis", "Účet", "Názov účtu", "MD", "D"];
    const rows = filteredEntries.map((e) => [
      formatDate(e.date),
      e.transactionNumber,
      e.description,
      e.line.accountCode,
      e.line.accountName,
      e.line.side === "MD" ? e.line.amount.toFixed(2) : "",
      e.line.side === "D" ? e.line.amount.toFixed(2) : "",
    ]);
    
    const csv = [headers.join(";"), ...rows.map((r) => r.map((c) => `"${c}"`).join(";"))].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `uctovny-dennik-${periodFilter}.csv`;
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
          <h1 className="text-2xl font-bold text-slate-900">Účtovný denník</h1>
          <p className="text-slate-500">Chronologický prehľad všetkých účtovných zápisov</p>
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
              placeholder="Hľadať..."
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
          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
          >
            <option value="">Všetky účty</option>
            {uniqueAccounts.map((code) => (
              <option key={code} value={code}>{code}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-100">
          <div className="text-sm text-slate-500">Počet zápisov</div>
          <div className="text-2xl font-bold text-slate-900">{filteredEntries.length}</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-100">
          <div className="text-sm text-slate-500">Σ MD</div>
          <div className="text-2xl font-bold text-slate-900">{formatEUR(totalMd)}</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-100">
          <div className="text-sm text-slate-500">Σ D</div>
          <div className="text-2xl font-bold text-slate-900">{formatEUR(totalD)}</div>
        </div>
      </div>

      {/* Journal table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50">
                <th className="text-left text-xs font-medium text-slate-500 uppercase px-6 py-3">Dátum</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase px-6 py-3">Číslo</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase px-6 py-3">Popis</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase px-6 py-3">Účet</th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase px-6 py-3">MD</th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase px-6 py-3">D</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEntries.map((entry, index) => (
                <tr key={`${entry.transactionId}-${entry.line.id}-${index}`} className="hover:bg-slate-50">
                  <td className="px-6 py-3 text-sm text-slate-600">
                    {formatDate(entry.date)}
                  </td>
                  <td className="px-6 py-3">
                    <span className="font-mono text-sm text-slate-900">{entry.transactionNumber}</span>
                  </td>
                  <td className="px-6 py-3 text-sm text-slate-600 max-w-xs truncate">
                    {entry.line.description || entry.description}
                  </td>
                  <td className="px-6 py-3">
                    <span className="font-mono text-sm">{entry.line.accountCode}</span>
                    <span className="text-slate-500 text-sm ml-2">{entry.line.accountName}</span>
                  </td>
                  <td className="px-6 py-3 text-right font-mono text-sm">
                    {entry.line.side === "MD" ? formatEUR(entry.line.amount) : ""}
                  </td>
                  <td className="px-6 py-3 text-right font-mono text-sm">
                    {entry.line.side === "D" ? formatEUR(entry.line.amount) : ""}
                  </td>
                </tr>
              ))}
              {filteredEntries.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    Žiadne zápisy v tomto období
                  </td>
                </tr>
              )}
            </tbody>
            {filteredEntries.length > 0 && (
              <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                <tr className="font-semibold">
                  <td colSpan={4} className="px-6 py-3 text-right text-sm">Súčet:</td>
                  <td className="px-6 py-3 text-right font-mono text-sm">{formatEUR(totalMd)}</td>
                  <td className="px-6 py-3 text-right font-mono text-sm">{formatEUR(totalD)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
