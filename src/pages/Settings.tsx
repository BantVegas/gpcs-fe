// src/pages/Settings.tsx
import { useEffect, useState } from "react";
import {
  Building2,
  Calculator,
  Save,
  RotateCcw,
} from "lucide-react";
import { subscribeToSettings, updateSettings } from "@/lib/firebaseServices";
import type { CompanySettings, TaxSettings, CorporateTaxMode } from "@/lib/schemas";
import { DEFAULT_COMPANY_SETTINGS, DEFAULT_TAX_SETTINGS } from "@/lib/schemas";

export default function Settings() {
  const [settings, setSettings] = useState<CompanySettings>(DEFAULT_COMPANY_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"company" | "tax">("company");

  const [companyName, setCompanyName] = useState("");
  const [ico, setIco] = useState("");
  const [dic, setDic] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [zip, setZip] = useState("");
  const [country, setCountry] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [iban, setIban] = useState("");

  const [taxYear, setTaxYear] = useState(2026);
  const [corporateTaxMode, setCorporateTaxMode] = useState<CorporateTaxMode>("FIXED");
  const [corporateTaxFixedRate, setCorporateTaxFixedRate] = useState("10");
  const [dividendRate, setDividendRate] = useState("7");
  const [lossCarryforward, setLossCarryforward] = useState("0");

  useEffect(() => {
    const unsub = subscribeToSettings((s) => {
      setSettings(s);
      
      setCompanyName(s.companyName || "");
      setIco(s.ico || "");
      setDic(s.dic || "");
      setStreet(s.street || "");
      setCity(s.city || "");
      setZip(s.zip || "");
      setCountry(s.country || "");
      setPhone(s.phone || "");
      setEmail(s.email || "");
      setIban(s.iban || "");
      
      setTaxYear(s.tax?.year || 2026);
      setCorporateTaxMode(s.tax?.corporateTaxMode || "FIXED");
      setCorporateTaxFixedRate(((s.tax?.corporateTaxFixedRate || 0.10) * 100).toString());
      setDividendRate(((s.tax?.dividendWithholdingRate || 0.07) * 100).toString());
      setLossCarryforward((s.tax?.lossCarryforward || 0).toString());
      
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleSaveCompany = async () => {
    setSaving(true);
    try {
      await updateSettings({
        companyName,
        ico,
        dic,
        street,
        city,
        zip,
        country,
        phone,
        email,
        iban,
      });
      alert("Nastavenia ulozene");
    } catch (err) {
      console.error("Save failed:", err);
      alert("Nepodarilo sa ulozit nastavenia");
    }
    setSaving(false);
  };

  const handleSaveTax = async () => {
    setSaving(true);
    try {
      const tax: TaxSettings = {
        ...settings.tax,
        year: taxYear,
        corporateTaxMode,
        corporateTaxFixedRate: parseFloat(corporateTaxFixedRate) / 100,
        dividendWithholdingRate: parseFloat(dividendRate) / 100,
        lossCarryforward: parseFloat(lossCarryforward) || 0,
      };
      await updateSettings({ tax });
      alert("Danove nastavenia ulozene");
    } catch (err) {
      console.error("Save failed:", err);
      alert("Nepodarilo sa ulozit nastavenia");
    }
    setSaving(false);
  };

  const handleResetTax = () => {
    if (!confirm("Naozaj chcete obnovit predvolene danove nastavenia?")) return;
    setTaxYear(DEFAULT_TAX_SETTINGS.year);
    setCorporateTaxMode(DEFAULT_TAX_SETTINGS.corporateTaxMode);
    setCorporateTaxFixedRate((DEFAULT_TAX_SETTINGS.corporateTaxFixedRate * 100).toString());
    setDividendRate((DEFAULT_TAX_SETTINGS.dividendWithholdingRate * 100).toString());
    setLossCarryforward(DEFAULT_TAX_SETTINGS.lossCarryforward.toString());
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Nastavenia</h1>
        <p className="text-slate-500 mt-1">Konfiguracia firmy a danovych sadzieb</p>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab("company")}
          className={`px-4 py-3 font-medium text-sm border-b-2 transition-all ${
            activeTab === "company"
              ? "border-slate-900 text-slate-900"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <span className="flex items-center gap-2">
            <Building2 size={18} />
            Firma
          </span>
        </button>
        <button
          onClick={() => setActiveTab("tax")}
          className={`px-4 py-3 font-medium text-sm border-b-2 transition-all ${
            activeTab === "tax"
              ? "border-slate-900 text-slate-900"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          <span className="flex items-center gap-2">
            <Calculator size={18} />
            Dane
          </span>
        </button>
      </div>

      {activeTab === "company" && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-6">Firemne udaje</h2>
          
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Nazov firmy</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ICO</label>
                <input
                  type="text"
                  value={ico}
                  onChange={(e) => setIco(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">DIC</label>
                <input
                  type="text"
                  value={dic}
                  onChange={(e) => setDic(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                />
              </div>
            </div>

            <div className="border-t border-slate-100 pt-6">
              <h3 className="font-medium text-slate-700 mb-4">Adresa</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-3">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Ulica a cislo</label>
                  <input
                    type="text"
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">PSC</label>
                  <input
                    type="text"
                    value={zip}
                    onChange={(e) => setZip(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Mesto</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Krajina</label>
                  <input
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-6">
              <h3 className="font-medium text-slate-700 mb-4">Kontakt</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Telefon</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">IBAN</label>
                  <input
                    type="text"
                    value={iban}
                    onChange={(e) => setIban(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <button
                onClick={handleSaveCompany}
                disabled={saving}
                className="inline-flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 disabled:opacity-50"
              >
                <Save size={18} />
                {saving ? "Ukladam..." : "Ulozit zmeny"}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "tax" && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-slate-900">Danove nastavenia</h2>
            <button
              onClick={handleResetTax}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              <RotateCcw size={14} />
              Obnovit predvolene
            </button>
          </div>
          
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Danovy rok</label>
                <select
                  value={taxYear}
                  onChange={(e) => setTaxYear(Number(e.target.value))}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                >
                  {[2024, 2025, 2026, 2027].map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-6">
              <h3 className="font-medium text-slate-700 mb-4">Dan z prijmov pravnickych osob (DPPO)</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Rezim sadzby</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={corporateTaxMode === "FIXED"}
                        onChange={() => setCorporateTaxMode("FIXED")}
                        className="text-slate-900"
                      />
                      <span className="text-sm">Fixna sadzba</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        checked={corporateTaxMode === "AUTO_BRACKETS"}
                        onChange={() => setCorporateTaxMode("AUTO_BRACKETS")}
                        className="text-slate-900"
                      />
                      <span className="text-sm">Automaticky podla obratu</span>
                    </label>
                  </div>
                </div>

                {corporateTaxMode === "FIXED" && (
                  <div className="max-w-xs">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Sadzba DPPO (%)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={corporateTaxFixedRate}
                      onChange={(e) => setCorporateTaxFixedRate(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                    />
                    <p className="text-xs text-slate-500 mt-1">Predvolene: 10% pre mikrodanovnikov</p>
                  </div>
                )}

                {corporateTaxMode === "AUTO_BRACKETS" && (
                  <div className="bg-slate-50 rounded-xl p-4">
                    <p className="text-sm text-slate-600 mb-3">Sadzby podla vynosov (obratu):</p>
                    <ul className="space-y-2 text-sm">
                      <li className="flex justify-between">
                        <span>Do 100 000 EUR</span>
                        <span className="font-medium">10%</span>
                      </li>
                      <li className="flex justify-between">
                        <span>100 001 - 5 000 000 EUR</span>
                        <span className="font-medium">21%</span>
                      </li>
                      <li className="flex justify-between">
                        <span>Nad 5 000 000 EUR</span>
                        <span className="font-medium">24%</span>
                      </li>
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-slate-100 pt-6">
              <h3 className="font-medium text-slate-700 mb-4">Dividendy</h3>
              <div className="max-w-xs">
                <label className="block text-sm font-medium text-slate-700 mb-1">Zrazka dane z dividend (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={dividendRate}
                  onChange={(e) => setDividendRate(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                />
                <p className="text-xs text-slate-500 mt-1">Predvolene: 7%</p>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-6">
              <h3 className="font-medium text-slate-700 mb-4">Ostatne</h3>
              <div className="max-w-xs">
                <label className="block text-sm font-medium text-slate-700 mb-1">Prenesena strata (EUR)</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={lossCarryforward}
                  onChange={(e) => setLossCarryforward(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                />
                <p className="text-xs text-slate-500 mt-1">Strata z minulych rokov na odpocet</p>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <button
                onClick={handleSaveTax}
                disabled={saving}
                className="inline-flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 disabled:opacity-50"
              >
                <Save size={18} />
                {saving ? "Ukladam..." : "Ulozit danove nastavenia"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
