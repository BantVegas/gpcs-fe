// src/pages/accounting/ChartOfAccounts.tsx
import { useState, useEffect } from "react";
import { Plus, Search, X, Pencil, Trash2 } from "lucide-react";
import { db } from "@/firebase";
import { collection, doc, getDocs, setDoc, updateDoc, deleteDoc, Timestamp } from "firebase/firestore";
import { useUser } from "@/components/AuthGate";
import type { Account, AccountType, AccountSide } from "@/lib/accountingSchemas";
import { DEFAULT_ACCOUNTS } from "@/lib/accountingSchemas";

const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: "ASSET", label: "Aktíva" },
  { value: "LIABILITY", label: "Pasíva" },
  { value: "EQUITY", label: "Vlastné imanie" },
  { value: "REVENUE", label: "Výnosy" },
  { value: "EXPENSE", label: "Náklady" },
];

const ACCOUNT_SIDES: { value: AccountSide; label: string }[] = [
  { value: "MD", label: "MD (Má dať)" },
  { value: "D", label: "D (Dal)" },
];

function getCompanyId(): string {
  const stored = localStorage.getItem("gpcs-company-id");
  return stored || "gpcs";
}

export default function ChartOfAccounts() {
  useUser(); // Auth check
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [filterType, setFilterType] = useState<AccountType | "all">("all");

  // Form state
  const [formCode, setFormCode] = useState("");
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<AccountType>("ASSET");
  const [formSide, setFormSide] = useState<AccountSide>("MD");
  const [formDescription, setFormDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadAccounts();
  }, []);

  async function loadAccounts() {
    const companyId = getCompanyId();
    const accountsRef = collection(db, "companies", companyId, "chartOfAccounts");
    const snap = await getDocs(accountsRef);
    
    if (snap.empty) {
      // Initialize with default accounts
      await initializeDefaultAccounts();
      return;
    }
    
    const loaded = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Account));
    loaded.sort((a, b) => a.code.localeCompare(b.code));
    setAccounts(loaded);
    setLoading(false);
  }

  async function initializeDefaultAccounts() {
    const companyId = getCompanyId();
    const accountsRef = collection(db, "companies", companyId, "chartOfAccounts");
    const now = Timestamp.now();
    
    for (const acc of DEFAULT_ACCOUNTS) {
      const newRef = doc(accountsRef, acc.code);
      await setDoc(newRef, {
        ...acc,
        id: acc.code,
        createdAt: now,
        updatedAt: now,
      });
    }
    
    await loadAccounts();
  }

  const filteredAccounts = accounts.filter((acc) => {
    const matchesQuery = 
      acc.code.toLowerCase().includes(query.toLowerCase()) ||
      acc.name.toLowerCase().includes(query.toLowerCase());
    const matchesType = filterType === "all" || acc.type === filterType;
    return matchesQuery && matchesType;
  });

  const openForm = (account?: Account) => {
    if (account) {
      setEditingAccount(account);
      setFormCode(account.code);
      setFormName(account.name);
      setFormType(account.type);
      setFormSide(account.normalSide);
      setFormDescription(account.description || "");
    } else {
      setEditingAccount(null);
      setFormCode("");
      setFormName("");
      setFormType("ASSET");
      setFormSide("MD");
      setFormDescription("");
    }
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingAccount(null);
  };

  const handleSave = async () => {
    if (!formCode || !formName) {
      alert("Vyplňte kód a názov účtu");
      return;
    }

    setSaving(true);
    const companyId = getCompanyId();
    const now = Timestamp.now();

    try {
      if (editingAccount) {
        const ref = doc(db, "companies", companyId, "chartOfAccounts", editingAccount.id);
        await updateDoc(ref, {
          name: formName,
          type: formType,
          normalSide: formSide,
          description: formDescription,
          updatedAt: now,
        });
      } else {
        const ref = doc(db, "companies", companyId, "chartOfAccounts", formCode);
        await setDoc(ref, {
          id: formCode,
          code: formCode,
          name: formName,
          type: formType,
          normalSide: formSide,
          description: formDescription,
          isActive: true,
          isSystem: false,
          createdAt: now,
          updatedAt: now,
        });
      }
      await loadAccounts();
      closeForm();
    } catch (err) {
      console.error("Save failed:", err);
      alert("Nepodarilo sa uložiť účet");
    }
    setSaving(false);
  };

  const handleToggleActive = async (account: Account) => {
    const companyId = getCompanyId();
    const ref = doc(db, "companies", companyId, "chartOfAccounts", account.id);
    await updateDoc(ref, {
      isActive: !account.isActive,
      updatedAt: Timestamp.now(),
    });
    await loadAccounts();
  };

  const handleDelete = async (account: Account) => {
    if (account.isSystem) {
      alert("Systémové účty nie je možné zmazať");
      return;
    }
    if (!confirm(`Naozaj chcete zmazať účet ${account.code} - ${account.name}?`)) return;
    
    const companyId = getCompanyId();
    const ref = doc(db, "companies", companyId, "chartOfAccounts", account.id);
    await deleteDoc(ref);
    await loadAccounts();
  };

  const getTypeLabel = (type: AccountType) => {
    return ACCOUNT_TYPES.find((t) => t.value === type)?.label || type;
  };

  const getTypeColor = (type: AccountType) => {
    switch (type) {
      case "ASSET": return "bg-blue-100 text-blue-700";
      case "LIABILITY": return "bg-purple-100 text-purple-700";
      case "EQUITY": return "bg-indigo-100 text-indigo-700";
      case "REVENUE": return "bg-emerald-100 text-emerald-700";
      case "EXPENSE": return "bg-rose-100 text-rose-700";
      default: return "bg-slate-100 text-slate-700";
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
          <h1 className="text-2xl font-bold text-slate-900">Účtový rozvrh</h1>
          <p className="text-slate-500">Správa účtov pre podvojné účtovníctvo</p>
        </div>
        <button
          onClick={() => openForm()}
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors"
        >
          <Plus size={20} />
          Pridať účet
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Hľadať podľa kódu alebo názvu..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
            />
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as AccountType | "all")}
            className="px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
          >
            <option value="all">Všetky typy</option>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Accounts table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50">
                <th className="text-left text-xs font-medium text-slate-500 uppercase px-6 py-3">Kód</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase px-6 py-3">Názov</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase px-6 py-3">Typ</th>
                <th className="text-center text-xs font-medium text-slate-500 uppercase px-6 py-3">Strana</th>
                <th className="text-center text-xs font-medium text-slate-500 uppercase px-6 py-3">Stav</th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase px-6 py-3">Akcie</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAccounts.map((account) => (
                <tr key={account.id} className={`hover:bg-slate-50 ${!account.isActive ? "opacity-50" : ""}`}>
                  <td className="px-6 py-4">
                    <span className="font-mono font-semibold text-slate-900">{account.code}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <div className="font-medium text-slate-900">{account.name}</div>
                      {account.description && (
                        <div className="text-sm text-slate-500">{account.description}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getTypeColor(account.type)}`}>
                      {getTypeLabel(account.type)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="font-mono text-sm">{account.normalSide}</span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button
                      onClick={() => handleToggleActive(account)}
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        account.isActive
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {account.isActive ? "Aktívny" : "Neaktívny"}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openForm(account)}
                        className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
                        title="Upraviť"
                      >
                        <Pencil size={16} />
                      </button>
                      {!account.isSystem && (
                        <button
                          onClick={() => handleDelete(account)}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                          title="Zmazať"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredAccounts.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    Žiadne účty
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={closeForm}>
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-900">
                {editingAccount ? "Upraviť účet" : "Nový účet"}
              </h2>
              <button onClick={closeForm} className="p-2 hover:bg-slate-100 rounded-lg">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Kód účtu</label>
                  <input
                    type="text"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    disabled={!!editingAccount}
                    placeholder="napr. 221"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Typ účtu</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as AccountType)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                  >
                    {ACCOUNT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Názov účtu</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="napr. Bankové účty"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Normálna strana</label>
                <select
                  value={formSide}
                  onChange={(e) => setFormSide(e.target.value as AccountSide)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                >
                  {ACCOUNT_SIDES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Popis (voliteľné)</label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none resize-none"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeForm}
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
      )}
    </div>
  );
}
