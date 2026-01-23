// src/pages/accounting/Transactions.tsx
import { useState, useEffect } from "react";
import { Plus, Search, Eye, Pencil, Trash2, Check, Lock, X } from "lucide-react";
import { db } from "@/firebase";
import { collection, doc, getDocs, setDoc, updateDoc, deleteDoc, Timestamp } from "firebase/firestore";
import { useUser } from "@/components/AuthGate";
import type { Transaction, TransactionLine, TransactionStatus, Account } from "@/lib/accountingSchemas";
import { validateEntity, logAuditEntry, type RuleResult, type TransactionData } from "@/lib/ruleEngine";
import { ValidationModal } from "@/components/HelpTip";

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

export default function Transactions() {
  const user = useUser();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TransactionStatus | "all">("all");
  const [periodFilter, setPeriodFilter] = useState<string>(new Date().toISOString().slice(0, 7));
  const [showForm, setShowForm] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [viewingTransaction, setViewingTransaction] = useState<Transaction | null>(null);

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
    loadedAccounts.sort((a, b) => a.code.localeCompare(b.code));
    setAccounts(loadedAccounts);
    
    // Load transactions
    const transactionsRef = collection(db, "companies", companyId, "transactions");
    const transactionsSnap = await getDocs(transactionsRef);
    const loadedTransactions = transactionsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Transaction));
    loadedTransactions.sort((a, b) => {
      const dateA = a.date instanceof Timestamp ? a.date.toDate() : new Date();
      const dateB = b.date instanceof Timestamp ? b.date.toDate() : new Date();
      return dateB.getTime() - dateA.getTime();
    });
    setTransactions(loadedTransactions);
    setLoading(false);
  }

  const filteredTransactions = transactions.filter((t) => {
    const matchesQuery = 
      t.number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || t.status === statusFilter;
    const matchesPeriod = !periodFilter || t.period === periodFilter;
    return matchesQuery && matchesStatus && matchesPeriod;
  });

  const handlePost = async (transaction: Transaction) => {
    if (transaction.totalMd !== transaction.totalD) {
      alert("Transakcia nie je vyvážená! MD ≠ D");
      return;
    }
    
    const companyId = getCompanyId();
    const ref = doc(db, "companies", companyId, "transactions", transaction.id);
    await updateDoc(ref, {
      status: "POSTED",
      postedAt: Timestamp.now(),
      postedBy: user?.uid,
      updatedAt: Timestamp.now(),
    });
    await loadData();
  };

  const handleDelete = async (transaction: Transaction) => {
    if (transaction.status === "LOCKED") {
      alert("Zamknuté transakcie nie je možné zmazať");
      return;
    }
    if (!confirm(`Naozaj chcete zmazať transakciu ${transaction.number}?`)) return;
    
    const companyId = getCompanyId();
    const ref = doc(db, "companies", companyId, "transactions", transaction.id);
    await deleteDoc(ref);
    await loadData();
  };

  const getStatusBadge = (status: TransactionStatus) => {
    switch (status) {
      case "DRAFT":
        return <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Koncept</span>;
      case "POSTED":
        return <span className="px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">Zaúčtované</span>;
      case "LOCKED":
        return <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">Zamknuté</span>;
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
          <h1 className="text-2xl font-bold text-slate-900">Účtovanie</h1>
          <p className="text-slate-500">Transakcie s podvojným zápisom MD/D</p>
        </div>
        <button
          onClick={() => { setEditingTransaction(null); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors"
        >
          <Plus size={20} />
          Nová transakcia
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
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as TransactionStatus | "all")}
            className="px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
          >
            <option value="all">Všetky stavy</option>
            <option value="DRAFT">Koncept</option>
            <option value="POSTED">Zaúčtované</option>
            <option value="LOCKED">Zamknuté</option>
          </select>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-100">
          <div className="text-sm text-slate-500">Celkom transakcií</div>
          <div className="text-2xl font-bold text-slate-900">{filteredTransactions.length}</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-100">
          <div className="text-sm text-slate-500">Koncepty</div>
          <div className="text-2xl font-bold text-amber-600">
            {filteredTransactions.filter((t) => t.status === "DRAFT").length}
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-100">
          <div className="text-sm text-slate-500">Zaúčtované</div>
          <div className="text-2xl font-bold text-emerald-600">
            {filteredTransactions.filter((t) => t.status === "POSTED" || t.status === "LOCKED").length}
          </div>
        </div>
      </div>

      {/* Transactions table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50">
                <th className="text-left text-xs font-medium text-slate-500 uppercase px-6 py-3">Číslo</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase px-6 py-3">Dátum</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase px-6 py-3">Popis</th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase px-6 py-3">MD</th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase px-6 py-3">D</th>
                <th className="text-center text-xs font-medium text-slate-500 uppercase px-6 py-3">Stav</th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase px-6 py-3">Akcie</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTransactions.map((transaction) => (
                <tr key={transaction.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <span className="font-mono font-semibold text-slate-900">{transaction.number}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {formatDate(transaction.date)}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-slate-900 max-w-xs truncate">{transaction.description}</div>
                    <div className="text-xs text-slate-500">
                      {transaction.lines.length} riadkov
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-sm">
                    {formatEUR(transaction.totalMd)}
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-sm">
                    {formatEUR(transaction.totalD)}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {getStatusBadge(transaction.status)}
                    {transaction.totalMd !== transaction.totalD && (
                      <span className="ml-2 text-xs text-rose-600">⚠️ Nevyvážené</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setViewingTransaction(transaction)}
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
                        title="Zobraziť"
                      >
                        <Eye size={16} />
                      </button>
                      {transaction.status === "DRAFT" && (
                        <>
                          <button
                            onClick={() => handlePost(transaction)}
                            className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg"
                            title="Zaúčtovať"
                          >
                            <Check size={16} />
                          </button>
                          <button
                            onClick={() => { setEditingTransaction(transaction); setShowForm(true); }}
                            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
                            title="Upraviť"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(transaction)}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                            title="Zmazať"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                      {transaction.status === "LOCKED" && (
                        <Lock size={16} className="text-slate-400" />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredTransactions.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    Žiadne transakcie
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transaction detail modal */}
      {viewingTransaction && (
        <TransactionDetailModal
          transaction={viewingTransaction}
          onClose={() => setViewingTransaction(null)}
        />
      )}

      {/* Transaction form modal */}
      {showForm && (
        <TransactionFormModal
          transaction={editingTransaction}
          accounts={accounts}
          onClose={() => { setShowForm(false); setEditingTransaction(null); }}
          onSave={() => { loadData(); setShowForm(false); setEditingTransaction(null); }}
        />
      )}
    </div>
  );
}

function TransactionDetailModal({
  transaction,
  onClose,
}: {
  transaction: Transaction;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Transakcia {transaction.number}</h2>
            <p className="text-sm text-slate-500">{formatDate(transaction.date)}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <X size={20} />
          </button>
        </div>

        <div className="mb-4">
          <div className="text-sm text-slate-500">Popis</div>
          <div className="text-slate-900">{transaction.description}</div>
        </div>

        <table className="w-full mb-4">
          <thead>
            <tr className="bg-slate-50">
              <th className="text-left text-xs font-medium text-slate-500 uppercase px-4 py-2">Účet</th>
              <th className="text-left text-xs font-medium text-slate-500 uppercase px-4 py-2">Popis</th>
              <th className="text-right text-xs font-medium text-slate-500 uppercase px-4 py-2">MD</th>
              <th className="text-right text-xs font-medium text-slate-500 uppercase px-4 py-2">D</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {transaction.lines.map((line) => (
              <tr key={line.id}>
                <td className="px-4 py-2">
                  <span className="font-mono">{line.accountCode}</span>
                  <span className="text-slate-500 ml-2">{line.accountName}</span>
                </td>
                <td className="px-4 py-2 text-sm text-slate-600">{line.description || "—"}</td>
                <td className="px-4 py-2 text-right font-mono">
                  {line.side === "MD" ? formatEUR(line.amount) : "—"}
                </td>
                <td className="px-4 py-2 text-right font-mono">
                  {line.side === "D" ? formatEUR(line.amount) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-slate-200">
            <tr className="font-semibold">
              <td colSpan={2} className="px-4 py-2 text-right">Súčet:</td>
              <td className="px-4 py-2 text-right font-mono">{formatEUR(transaction.totalMd)}</td>
              <td className="px-4 py-2 text-right font-mono">{formatEUR(transaction.totalD)}</td>
            </tr>
          </tfoot>
        </table>

        {transaction.totalMd !== transaction.totalD && (
          <div className="p-3 bg-rose-50 text-rose-700 rounded-lg text-sm">
            ⚠️ Transakcia nie je vyvážená! Rozdiel: {formatEUR(Math.abs(transaction.totalMd - transaction.totalD))}
          </div>
        )}
      </div>
    </div>
  );
}

function TransactionFormModal({
  transaction,
  accounts,
  onClose,
  onSave,
}: {
  transaction: Transaction | null;
  accounts: Account[];
  onClose: () => void;
  onSave: () => void;
}) {
  const user = useUser();
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState(
    transaction?.date instanceof Timestamp
      ? transaction.date.toDate().toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10)
  );
  const [description, setDescription] = useState(transaction?.description || "");
  const [lines, setLines] = useState<TransactionLine[]>(
    transaction?.lines || [
      { id: "1", accountCode: "", accountName: "", side: "MD", amount: 0 },
      { id: "2", accountCode: "", accountName: "", side: "D", amount: 0 },
    ]
  );

  const totalMd = lines.filter((l) => l.side === "MD").reduce((sum, l) => sum + l.amount, 0);
  const totalD = lines.filter((l) => l.side === "D").reduce((sum, l) => sum + l.amount, 0);
  const isBalanced = totalMd === totalD && totalMd > 0;

  const addLine = () => {
    setLines([...lines, {
      id: Date.now().toString(),
      accountCode: "",
      accountName: "",
      side: "MD",
      amount: 0,
    }]);
  };

  const removeLine = (id: string) => {
    if (lines.length <= 2) return;
    setLines(lines.filter((l) => l.id !== id));
  };

  const updateLine = (id: string, field: keyof TransactionLine, value: any) => {
    setLines(lines.map((l) => {
      if (l.id !== id) return l;
      const updated = { ...l, [field]: value };
      if (field === "accountCode") {
        const account = accounts.find((a) => a.code === value);
        updated.accountName = account?.name || "";
      }
      return updated;
    }));
  };

  const [validationResult, setValidationResult] = useState<RuleResult | null>(null);
  const [showValidationModal, setShowValidationModal] = useState(false);

  const runValidation = async (): Promise<RuleResult> => {
    const companyId = getCompanyId();
    const period = date.slice(0, 7);
    
    const txData: TransactionData = {
      id: transaction?.id,
      description,
      date: new Date(date),
      lines: lines.map((l) => ({
        id: l.id,
        accountCode: l.accountCode,
        side: l.side as "MD" | "D",
        amount: l.amount,
        partnerId: l.partnerId,
        partnerName: l.partnerName,
        description: l.description,
      })),
      status: transaction?.status,
      templateId: transaction?.templateId,
    };
    
    return validateEntity("TRANSACTION", txData, { companyId, period, userId: user?.uid });
  };

  const handleSave = async (overrideWarnings = false) => {
    setSaving(true);
    
    // Run validation
    const result = await runValidation();
    
    // If there are blocks, show modal and stop
    if (result.blocks.length > 0) {
      setValidationResult(result);
      setShowValidationModal(true);
      setSaving(false);
      return;
    }
    
    // If there are warnings and not overriding, show modal
    if (result.warnings.length > 0 && !overrideWarnings) {
      setValidationResult(result);
      setShowValidationModal(true);
      setSaving(false);
      return;
    }
    
    // Log override if warnings were bypassed
    if (overrideWarnings && result.warnings.length > 0) {
      const companyId = getCompanyId();
      await logAuditEntry(companyId, {
        type: "OVERRIDE_WARNING",
        ruleCodes: result.warnings.map((w) => w.code),
        entityType: "TRANSACTION",
        entityId: transaction?.id,
        ref: { transactionId: transaction?.id },
        by: user?.uid || "",
        notes: `Používateľ potvrdil uloženie napriek ${result.warnings.length} upozorneniam`,
      });
    }

    const companyId = getCompanyId();
    const now = Timestamp.now();
    const period = date.slice(0, 7);

    try {
      if (transaction) {
        const ref = doc(db, "companies", companyId, "transactions", transaction.id);
        await updateDoc(ref, {
          date: Timestamp.fromDate(new Date(date)),
          description,
          lines,
          totalMd,
          totalD,
          period,
          updatedAt: now,
        });
      } else {
        // Generate transaction number
        const transactionsRef = collection(db, "companies", companyId, "transactions");
        const snap = await getDocs(transactionsRef);
        const nextNum = snap.size + 1;
        const number = `TRN-${period.replace("-", "")}-${String(nextNum).padStart(4, "0")}`;

        const newRef = doc(transactionsRef);
        await setDoc(newRef, {
          id: newRef.id,
          number,
          date: Timestamp.fromDate(new Date(date)),
          description,
          lines,
          totalMd,
          totalD,
          status: "DRAFT",
          period,
          createdAt: now,
          updatedAt: now,
          createdBy: user?.uid || "",
        });
      }
      onSave();
    } catch (err) {
      console.error("Save failed:", err);
      alert("Nepodarilo sa uložiť transakciu");
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl p-6 w-full max-w-3xl shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-900">
            {transaction ? "Upraviť transakciu" : "Nová transakcia"}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Dátum</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Popis</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Popis transakcie"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700">Riadky</label>
              <button
                type="button"
                onClick={addLine}
                className="text-sm text-slate-600 hover:text-slate-900"
              >
                + Pridať riadok
              </button>
            </div>
            <div className="space-y-2">
              {lines.map((line) => (
                <div key={line.id} className="flex gap-2 items-center">
                  <select
                    value={line.accountCode}
                    onChange={(e) => updateLine(line.id, "accountCode", e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm"
                  >
                    <option value="">Vyberte účet</option>
                    {accounts.filter((a) => a.isActive).map((a) => (
                      <option key={a.code} value={a.code}>{a.code} - {a.name}</option>
                    ))}
                  </select>
                  <select
                    value={line.side}
                    onChange={(e) => updateLine(line.id, "side", e.target.value)}
                    className="w-20 px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono"
                  >
                    <option value="MD">MD</option>
                    <option value="D">D</option>
                  </select>
                  <input
                    type="number"
                    value={line.amount || ""}
                    onChange={(e) => updateLine(line.id, "amount", parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-28 px-3 py-2 rounded-lg border border-slate-200 text-sm text-right font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => removeLine(line.id)}
                    disabled={lines.length <= 2}
                    className="p-2 text-slate-400 hover:text-rose-600 disabled:opacity-30"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
            <div className="flex gap-8">
              <div>
                <span className="text-sm text-slate-500">Σ MD:</span>
                <span className="ml-2 font-mono font-semibold">{formatEUR(totalMd)}</span>
              </div>
              <div>
                <span className="text-sm text-slate-500">Σ D:</span>
                <span className="ml-2 font-mono font-semibold">{formatEUR(totalD)}</span>
              </div>
            </div>
            <div>
              {isBalanced ? (
                <span className="text-emerald-600 text-sm font-medium">✓ Vyvážené</span>
              ) : (
                <span className="text-rose-600 text-sm font-medium">⚠️ Nevyvážené</span>
              )}
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
              onClick={() => handleSave(false)}
              disabled={saving}
              className="flex-1 px-4 py-3 rounded-xl bg-slate-900 text-white font-medium hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? "Ukladám..." : "Uložiť ako koncept"}
            </button>
          </div>
        </div>

        {/* Validation Modal */}
        {showValidationModal && validationResult && (
          <ValidationModal
            result={validationResult}
            onClose={() => setShowValidationModal(false)}
            onProceed={validationResult.blocks.length === 0 ? () => {
              setShowValidationModal(false);
              handleSave(true);
            } : undefined}
          />
        )}
      </div>
    </div>
  );
}
