import { useEffect, useMemo, useState } from "react";
import { db } from "@/firebase";
import { doc, onSnapshot, setDoc, getDoc } from "firebase/firestore";
import { Link } from "react-router-dom";
import { useUser } from "@/components/AuthGate";
import { calculateTax, formatEUR } from "@/lib/taxCalculations";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  PiggyBank,
  FileText,
  Plus,
  Search,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Calculator,
  Pencil,
  Trash2,
  Download,
} from "lucide-react";

/* ========================== Types & helpers ========================== */
type EntryType = "prijem" | "vydavok";
interface Entry {
  id: string;
  type: EntryType;
  date: string;
  docNumber: string;
  company: string;
  amount: number;
}

const LS_KEY = "gpcs-bookkeeping-v1";
const COMPANY_FULL = "GPCS s.r.o. – Global Printing and Control Solutions";
const COMPANY_SHORT = "GPCS s.r.o.";

const todayISO = () => new Date().toISOString().slice(0, 10);
const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const parseNum = (v: string) => {
  if (v == null) return 0;
  let s = String(v);
  s = s.split("\u00A0").join("").split(" ").join("").replace(",", ".");
  s = Array.from(s).filter((ch) => "0123456789+-.".includes(ch)).join("");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

function deriveCompany(finalType: EntryType, company: string | undefined) {
  return finalType === "vydavok" ? COMPANY_SHORT : (company || "").trim();
}

function buildCsv(entries: Entry[]) {
  const header = ["id", "typ", "datum", "cislo_dokladu", "firma", "suma"];
  const rows = entries.map((e) =>
    [e.id, e.type, e.date, e.docNumber, e.company, e.amount.toFixed(2).replace(".", ",")]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(";")
  );
  return [header.join(";"), ...rows].join("\r\n");
}

const userDocRef = (uid: string) => doc(db, "users", uid, "app", "book");

/* ========================== App ========================== */
export default function App() {
  const user = useUser();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<EntryType>("prijem");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState<{
    type: EntryType;
    date: string;
    docNumber: string;
    company?: string;
    amount: number;
    amountText: string;
  }>({
    type: "prijem",
    date: todayISO(),
    docNumber: "",
    company: "",
    amount: 0,
    amountText: "",
  });

  // Load data
  useEffect(() => {
    let unsub: undefined | (() => void);
    setLoaded(false);
    (async () => {
      if (!user) {
        const saved = localStorage.getItem(LS_KEY);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed.entries)) setEntries(parsed.entries as Entry[]);
          } catch {}
        } else setEntries([]);
        setLoaded(true);
        return;
      }
      try {
        const ref = userDocRef(user.uid);
        const snap = await getDoc(ref);
        if (!snap.exists()) await setDoc(ref, { entries: [] });
        unsub = onSnapshot(ref, (s) => {
          const data = s.data();
          const arr = Array.isArray(data?.entries) ? (data!.entries as Entry[]) : [];
          setEntries(arr);
          localStorage.setItem(LS_KEY, JSON.stringify({ entries: arr }));
          setLoaded(true);
        });
      } catch {
        const saved = localStorage.getItem(LS_KEY);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed.entries)) setEntries(parsed.entries as Entry[]);
          } catch {}
        }
        setLoaded(true);
      }
    })();
    return () => unsub?.();
  }, [user]);

  // Persist data
  useEffect(() => {
    if (!user || !loaded) {
      localStorage.setItem(LS_KEY, JSON.stringify({ entries }));
      return;
    }
    (async () => {
      try {
        await setDoc(userDocRef(user.uid), { entries }, { merge: true });
      } catch {
      } finally {
        localStorage.setItem(LS_KEY, JSON.stringify({ entries }));
      }
    })();
  }, [entries, user, loaded]);

  // Derived data
  const allSorted = useMemo(
    () => [...entries].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [entries]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let result = allSorted;
    if (q) {
      result = result.filter((e) => 
        [e.docNumber, e.company, e.type].some((v) => String(v).toLowerCase().includes(q))
      );
    }
    return result.filter((e) => e.type === tab);
  }, [allSorted, query, tab]);

  const byTypeAll = (t: EntryType) => allSorted.filter((e) => e.type === t);
  const totals = useMemo(() => {
    const inc = byTypeAll("prijem").reduce((a, e) => a + e.amount, 0);
    const exp = byTypeAll("vydavok").reduce((a, e) => a + e.amount, 0);
    return { inc, exp, profit: inc - exp };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSorted]);

  const currentYear = String(new Date().getFullYear());
  const annualTurnover = useMemo(
    () => entries.filter((e) => e.type === "prijem" && (e.date || "").startsWith(currentYear)).reduce((a, e) => a + e.amount, 0),
    [entries, currentYear]
  );

  const taxResult = useMemo(() => {
    return calculateTax({
      totalIncome: totals.inc,
      totalExpenses: totals.exp,
      annualTurnover,
      executiveGrossSalary: 100,
    });
  }, [totals, annualTurnover]);

  const currentMonth = todayISO().slice(0, 7);
  const monthlyStats = useMemo(() => {
    const monthEntries = entries.filter((e) => e.date.startsWith(currentMonth));
    const inc = monthEntries.filter((e) => e.type === "prijem").reduce((a, e) => a + e.amount, 0);
    const exp = monthEntries.filter((e) => e.type === "vydavok").reduce((a, e) => a + e.amount, 0);
    return { inc, exp, profit: inc - exp, count: monthEntries.length };
  }, [entries, currentMonth]);

  // Actions
  const resetForm = (type: EntryType) => {
    setForm({ type, date: todayISO(), docNumber: "", company: "", amount: 0, amountText: "" });
    setEditingId(null);
  };

  const upsertEntry = (finalType: EntryType) => {
    if (!finalType) return;
    if (!form.date) { alert("Zadaj dátum"); return; }
    if (finalType === "prijem" && !String(form.company || "").trim()) { alert("Zadaj firmu pri príjme"); return; }
    const amt = form.amountText !== undefined && form.amountText !== "" ? parseNum(form.amountText) : Number(form.amount) || 0;
    if (amt <= 0) { alert("Suma musí byť > 0"); return; }

    const clean: Entry = {
      id: editingId ?? uuid(),
      type: finalType,
      date: form.date,
      docNumber: (form.docNumber || "").trim(),
      company: deriveCompany(finalType, form.company),
      amount: amt,
    };
    setEntries((prev) => {
      const exists = prev.some((e) => e.id === clean.id);
      return exists ? prev.map((e) => (e.id === clean.id ? clean : e)) : [clean, ...prev];
    });
    setQuery("");
    resetForm(finalType);
    setShowForm(false);
  };

  const editEntry = (e: Entry) => {
    setEditingId(e.id);
    setForm({ type: e.type, date: e.date, docNumber: e.docNumber, company: e.company, amount: e.amount, amountText: String(e.amount).replace(".", ",") });
    setTab(e.type);
    setShowForm(true);
  };

  const removeEntry = (id: string) => {
    if (!confirm("Zmazať záznam?")) return;
    setEntries((prev) => prev.filter((e) => e.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const downloadCSV = () => {
    const csv = buildCsv(entries);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ucto-export-${todayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Dashboard</h1>
            <p className="text-slate-500 mt-1">Prehľad vašich financií • {COMPANY_SHORT}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/invoices/new" className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/10">
              <FileText size={18} /> Nová faktúra
            </Link>
            <button onClick={() => { setShowForm(true); setTab("prijem"); resetForm("prijem"); }} className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-all">
              <Plus size={18} /> Príjem
            </button>
            <button onClick={() => { setShowForm(true); setTab("vydavok"); resetForm("vydavok"); }} className="inline-flex items-center gap-2 px-4 py-2.5 bg-rose-600 text-white rounded-xl font-medium hover:bg-rose-700 transition-all">
              <Plus size={18} /> Výdavok
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-blue-600" />
              </div>
              <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-full">+{byTypeAll("prijem").length}</span>
            </div>
            <p className="text-sm text-slate-500 mb-1">Celkové príjmy</p>
            <p className="text-2xl font-bold text-slate-900">{formatEUR(totals.inc)}</p>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center">
                <TrendingDown className="w-6 h-6 text-rose-600" />
              </div>
              <span className="text-xs font-medium text-rose-600 bg-rose-50 px-2 py-1 rounded-full">{byTypeAll("vydavok").length}</span>
            </div>
            <p className="text-sm text-slate-500 mb-1">Celkové výdavky</p>
            <p className="text-2xl font-bold text-slate-900">{formatEUR(totals.exp)}</p>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center">
                <Wallet className="w-6 h-6 text-emerald-600" />
              </div>
            </div>
            <p className="text-sm text-slate-500 mb-1">Hrubý zisk</p>
            <p className={`text-2xl font-bold ${totals.profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{formatEUR(totals.profit)}</p>
          </div>

          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
                <PiggyBank className="w-6 h-6 text-white" />
              </div>
              <span className="text-xs font-medium text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-full">{taxResult.taxRatePercent}</span>
            </div>
            <p className="text-sm text-slate-400 mb-1">Čistý zisk po zdanení</p>
            <p className="text-2xl font-bold text-white">{formatEUR(taxResult.netProfit)}</p>
            <p className="text-xs text-slate-400 mt-2">Daň: {formatEUR(taxResult.incomeTax)}</p>
          </div>
        </div>

        {/* Monthly + Tax */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
          <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Tento mesiac</h2>
                <p className="text-sm text-slate-500">{new Date().toLocaleDateString("sk-SK", { month: "long", year: "numeric" })}</p>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Calendar size={16} /> {monthlyStats.count} transakcií
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded-xl">
                <ArrowUpRight className="w-5 h-5 text-blue-600 mx-auto mb-2" />
                <p className="text-xs text-slate-500 mb-1">Príjmy</p>
                <p className="text-lg font-bold text-blue-600">{formatEUR(monthlyStats.inc)}</p>
              </div>
              <div className="text-center p-4 bg-rose-50 rounded-xl">
                <ArrowDownRight className="w-5 h-5 text-rose-600 mx-auto mb-2" />
                <p className="text-xs text-slate-500 mb-1">Výdavky</p>
                <p className="text-lg font-bold text-rose-600">{formatEUR(monthlyStats.exp)}</p>
              </div>
              <div className="text-center p-4 bg-emerald-50 rounded-xl">
                <Wallet className="w-5 h-5 text-emerald-600 mx-auto mb-2" />
                <p className="text-xs text-slate-500 mb-1">Zisk</p>
                <p className={`text-lg font-bold ${monthlyStats.profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{formatEUR(monthlyStats.profit)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                <Calculator className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Daňový prehľad SR 2025</h3>
              </div>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Ročný obrat</span><span className="font-medium">{formatEUR(annualTurnover)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Sadzba dane</span><span className="font-medium">{taxResult.taxRatePercent}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Základ dane</span><span className="font-medium">{formatEUR(taxResult.taxBase)}</span></div>
              <div className="h-px bg-slate-100 my-2" />
              <div className="flex justify-between"><span className="text-slate-700 font-medium">Odhadovaná daň</span><span className="font-bold text-amber-600">{formatEUR(taxResult.incomeTax)}</span></div>
            </div>
          </div>
        </div>

        {/* Form Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
            <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-xl font-bold text-slate-900 mb-6">{editingId ? "Upraviť" : "Nový"} {tab === "prijem" ? "príjem" : "výdavok"}</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Dátum</label>
                  <input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Číslo dokladu</label>
                  <input type="text" placeholder="F2025-001" value={form.docNumber} onChange={(e) => setForm((p) => ({ ...p, docNumber: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none" />
                </div>
                {tab === "prijem" && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Firma</label>
                    <input type="text" placeholder="Názov firmy" value={form.company || ""} onChange={(e) => setForm((p) => ({ ...p, company: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none" />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Suma (EUR)</label>
                  <input type="text" inputMode="decimal" placeholder="0,00" value={form.amountText} onChange={(e) => setForm((p) => ({ ...p, amountText: e.target.value, amount: parseNum(e.target.value) }))} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none text-xl font-semibold" />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowForm(false)} className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50">Zrušiť</button>
                <button onClick={() => upsertEntry(tab)} className={`flex-1 px-4 py-3 rounded-xl text-white font-medium ${tab === "prijem" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"}`}>{editingId ? "Uložiť" : "Pridať"}</button>
              </div>
            </div>
          </div>
        )}

        {/* Transactions */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-4">
                <h2 className="text-lg font-semibold text-slate-900">Záznamy</h2>
                <div className="flex bg-slate-100 rounded-lg p-1">
                  <button onClick={() => setTab("prijem")} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${tab === "prijem" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>Príjmy</button>
                  <button onClick={() => setTab("vydavok")} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${tab === "vydavok" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>Výdavky</button>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative flex-1 sm:flex-none">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type="text" placeholder="Hľadať..." value={query} onChange={(e) => setQuery(e.target.value)} className="w-full sm:w-64 pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:border-slate-900 outline-none text-sm" />
                </div>
                <button onClick={downloadCSV} className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50" title="Export CSV"><Download size={18} /></button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left text-xs font-medium text-slate-500 uppercase px-6 py-3">Dátum</th>
                  <th className="text-left text-xs font-medium text-slate-500 uppercase px-6 py-3">Č. dokladu</th>
                  <th className="text-left text-xs font-medium text-slate-500 uppercase px-6 py-3">Firma</th>
                  <th className="text-right text-xs font-medium text-slate-500 uppercase px-6 py-3">Suma</th>
                  <th className="text-right text-xs font-medium text-slate-500 uppercase px-6 py-3">Akcie</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 text-sm text-slate-600">{e.date}</td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">{e.docNumber || "—"}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{e.company}</td>
                    <td className={`px-6 py-4 text-sm font-semibold text-right ${e.type === "prijem" ? "text-emerald-600" : "text-rose-600"}`}>{e.type === "prijem" ? "+" : "-"}{formatEUR(e.amount)}</td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => editEntry(e)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"><Pencil size={16} /></button>
                      <button onClick={() => removeEntry(e.id)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"><Trash2 size={16} /></button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-500">Žiadne záznamy</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="text-center text-xs text-slate-400 mt-8">© {new Date().getFullYear()} {COMPANY_FULL}</div>
      </div>
    </div>
  );
}
