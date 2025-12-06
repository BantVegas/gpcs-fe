// src/pages/Companies.tsx
import { useState, useEffect } from "react";
import { collection, getDocs, doc, deleteDoc } from "firebase/firestore";
import { db } from "@/firebase";
import { getCompanyByICO, saveCompany } from "@/lib/companyLookup";
import type { Company } from "@/lib/types";
import {
  Building2,
  Search,
  Plus,
  Trash2,
  Pencil,
  ExternalLink,
  Loader2,
} from "lucide-react";

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchICO, setSearchICO] = useState("");
  const [searching, setSearching] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  
  const [form, setForm] = useState<Company>({
    ico: "",
    name: "",
    dic: "",
    icdph: "",
    street: "",
    city: "",
    zip: "",
    country: "Slovensko",
  });

  // Load companies from Firestore
  useEffect(() => {
    loadCompanies();
  }, []);

  const loadCompanies = async () => {
    setLoading(true);
    try {
      const snapshot = await getDocs(collection(db, "companies"));
      const data = snapshot.docs.map((doc) => doc.data() as Company);
      setCompanies(data.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (e) {
      console.error("Failed to load companies:", e);
    }
    setLoading(false);
  };

  const handleSearchICO = async () => {
    const cleanICO = searchICO.replace(/\s/g, "").padStart(8, "0");
    if (cleanICO.length !== 8) {
      alert("IČO musí mať 8 číslic");
      return;
    }

    setSearching(true);
    try {
      const found = await getCompanyByICO(cleanICO);
      if (found) {
        setForm(found);
        setShowForm(true);
        setEditingCompany(found);
        await loadCompanies();
      } else {
        alert("Firma sa nenašla. Môžete ju pridať manuálne.");
        setForm({ ...form, ico: cleanICO });
        setShowForm(true);
      }
    } catch (e) {
      console.error("Search failed:", e);
      alert("Vyhľadávanie zlyhalo. Skúste to znova.");
    }
    setSearching(false);
  };

  const handleSave = async () => {
    if (!form.ico || !form.name) {
      alert("IČO a názov sú povinné");
      return;
    }

    try {
      await saveCompany(form);
      await loadCompanies();
      setShowForm(false);
      setEditingCompany(null);
      resetForm();
    } catch (e) {
      console.error("Save failed:", e);
      alert("Uloženie zlyhalo");
    }
  };

  const handleDelete = async (ico: string) => {
    if (!confirm("Naozaj chcete zmazať túto firmu?")) return;
    
    try {
      await deleteDoc(doc(db, "companies", ico));
      await loadCompanies();
    } catch (e) {
      console.error("Delete failed:", e);
      alert("Mazanie zlyhalo");
    }
  };

  const handleEdit = (company: Company) => {
    setForm(company);
    setEditingCompany(company);
    setShowForm(true);
  };

  const resetForm = () => {
    setForm({
      ico: "",
      name: "",
      dic: "",
      icdph: "",
      street: "",
      city: "",
      zip: "",
      country: "Slovensko",
    });
    setEditingCompany(null);
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Firmy</h1>
          <p className="text-slate-500 mt-1">Databáza vašich obchodných partnerov</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition-all"
        >
          <Plus size={18} /> Pridať firmu
        </button>
      </div>

      {/* Search by ICO */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 mb-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Vyhľadať firmu podľa IČO</h2>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Zadajte IČO (napr. 12345678)"
              value={searchICO}
              onChange={(e) => setSearchICO(e.target.value.replace(/\D/g, "").slice(0, 8))}
              className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
              onKeyDown={(e) => e.key === "Enter" && handleSearchICO()}
            />
          </div>
          <button
            onClick={handleSearchICO}
            disabled={searching || searchICO.length < 8}
            className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
          >
            {searching ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search size={18} />}
            Hľadať
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Vyhľadáva v ORSR, FinStat a RPO registroch SR
        </p>
      </div>

      {/* Companies List */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-900">Uložené firmy ({companies.length})</h2>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-slate-400 mx-auto" />
            <p className="text-slate-500 mt-2">Načítavam...</p>
          </div>
        ) : companies.length === 0 ? (
          <div className="p-12 text-center">
            <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">Zatiaľ nemáte uložené žiadne firmy</p>
            <p className="text-sm text-slate-400 mt-1">Vyhľadajte firmu podľa IČO alebo ju pridajte manuálne</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {companies.map((company) => (
              <div key={company.ico} className="p-4 sm:p-6 hover:bg-slate-50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-slate-900 truncate">{company.name}</h3>
                      <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                        IČO: {company.ico}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-sm text-slate-600">
                      {company.dic && <div><span className="text-slate-400">DIČ:</span> {company.dic}</div>}
                      {company.icdph && <div><span className="text-slate-400">IČ DPH:</span> {company.icdph}</div>}
                      {company.street && <div><span className="text-slate-400">Adresa:</span> {company.street}</div>}
                      {company.city && <div><span className="text-slate-400">Mesto:</span> {company.zip} {company.city}</div>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleEdit(company)}
                      className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                      title="Upraviť"
                    >
                      <Pencil size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(company.ico)}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      title="Zmazať"
                    >
                      <Trash2 size={18} />
                    </button>
                    <a
                      href={`https://www.finstat.sk/${company.ico}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Zobraziť na FinStat"
                    >
                      <ExternalLink size={18} />
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-slate-900 mb-6">
              {editingCompany ? "Upraviť firmu" : "Nová firma"}
            </h2>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">IČO *</label>
                <input
                  type="text"
                  value={form.ico}
                  onChange={(e) => setForm({ ...form, ico: e.target.value.replace(/\D/g, "").slice(0, 8) })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                  disabled={!!editingCompany}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Názov *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">DIČ</label>
                <input
                  type="text"
                  value={form.dic || ""}
                  onChange={(e) => setForm({ ...form, dic: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">IČ DPH</label>
                <input
                  type="text"
                  value={form.icdph || ""}
                  onChange={(e) => setForm({ ...form, icdph: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Ulica</label>
                <input
                  type="text"
                  value={form.street || ""}
                  onChange={(e) => setForm({ ...form, street: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">PSČ</label>
                <input
                  type="text"
                  value={form.zip || ""}
                  onChange={(e) => setForm({ ...form, zip: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Mesto</label>
                <input
                  type="text"
                  value={form.city || ""}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Telefón</label>
                <input
                  type="text"
                  value={form.phone || ""}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">E-mail</label>
                <input
                  type="email"
                  value={form.email || ""}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">IBAN</label>
                <input
                  type="text"
                  value={form.iban || ""}
                  onChange={(e) => setForm({ ...form, iban: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                />
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowForm(false); resetForm(); }}
                className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50"
              >
                Zrušiť
              </button>
              <button
                onClick={handleSave}
                className="flex-1 px-4 py-3 rounded-xl bg-slate-900 text-white font-medium hover:bg-slate-800"
              >
                Uložiť
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
