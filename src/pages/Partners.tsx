// src/pages/Partners.tsx
import { useEffect, useState } from "react";
import { Timestamp } from "firebase/firestore";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  X,
  Building2,
  Phone,
  Mail,
  CreditCard,
} from "lucide-react";
import {
  subscribeToPartners,
  createPartner,
  updatePartner,
  deletePartner,
  lookupCompanyByICO,
} from "@/lib/firebaseServices";
import type { Partner, PartnerSource } from "@/lib/schemas";

export default function Partners() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);

  useEffect(() => {
    const unsub = subscribeToPartners((p) => {
      setPartners(p);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const filteredPartners = partners.filter((p) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      p.name?.toLowerCase().includes(q) ||
      p.ico?.toLowerCase().includes(q) ||
      p.city?.toLowerCase().includes(q)
    );
  });

  const handleDelete = async (id: string) => {
    if (!confirm("Naozaj chcete zmazat tohto partnera?")) return;
    await deletePartner(id);
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Partneri</h1>
          <p className="text-slate-500 mt-1">{partners.length} partnerov v databaze</p>
        </div>
        <button
          onClick={() => { setEditingPartner(null); setShowForm(true); }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition-all"
        >
          <Plus size={18} />
          Novy partner
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Hladat podla nazvu, ICO alebo mesta..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 sm:p-6">
          {filteredPartners.map((partner) => (
            <div
              key={partner.id}
              className="bg-slate-50 rounded-xl p-4 border border-slate-100 hover:border-slate-200 transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-slate-200 flex items-center justify-center">
                    <Building2 size={20} className="text-slate-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 line-clamp-1">{partner.name}</h3>
                    {partner.ico && (
                      <p className="text-xs text-slate-500">ICO: {partner.ico}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { setEditingPartner(partner); setShowForm(true); }}
                    className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(partner.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 text-sm text-slate-600">
                {partner.dic && (
                  <p className="text-xs">DIC: {partner.dic}</p>
                )}
                {(partner.street || partner.city) && (
                  <p className="text-xs line-clamp-1">
                    {[partner.street, partner.zip, partner.city].filter(Boolean).join(", ")}
                  </p>
                )}
                {partner.email && (
                  <p className="flex items-center gap-1 text-xs">
                    <Mail size={12} className="text-slate-400" />
                    {partner.email}
                  </p>
                )}
                {partner.phone && (
                  <p className="flex items-center gap-1 text-xs">
                    <Phone size={12} className="text-slate-400" />
                    {partner.phone}
                  </p>
                )}
                {partner.iban && (
                  <p className="flex items-center gap-1 text-xs">
                    <CreditCard size={12} className="text-slate-400" />
                    {partner.iban}
                  </p>
                )}
              </div>

              <div className="mt-3 pt-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-400">
                <span>{partner.source === "ICO_LOOKUP" ? "Z registra" : "Manualne"}</span>
                {partner.createdAt && (
                  <span>
                    {(partner.createdAt instanceof Timestamp
                      ? partner.createdAt.toDate()
                      : new Date(partner.createdAt)
                    ).toLocaleDateString("sk-SK")}
                  </span>
                )}
              </div>
            </div>
          ))}

          {filteredPartners.length === 0 && (
            <div className="col-span-full py-12 text-center text-slate-500">
              Ziadni partneri
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <PartnerForm
          partner={editingPartner}
          onClose={() => { setShowForm(false); setEditingPartner(null); }}
        />
      )}
    </div>
  );
}

function PartnerForm({
  partner,
  onClose,
}: {
  partner: Partner | null;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);

  const [name, setName] = useState(partner?.name || "");
  const [ico, setIco] = useState(partner?.ico || "");
  const [dic, setDic] = useState(partner?.dic || "");
  const [icdph, setIcdph] = useState(partner?.icdph || "");
  const [street, setStreet] = useState(partner?.street || "");
  const [city, setCity] = useState(partner?.city || "");
  const [zip, setZip] = useState(partner?.zip || "");
  const [country, setCountry] = useState(partner?.country || "Slovensko");
  const [phone, setPhone] = useState(partner?.phone || "");
  const [email, setEmail] = useState(partner?.email || "");
  const [iban, setIban] = useState(partner?.iban || "");

  const handleLookupICO = async () => {
    if (!ico || ico.length < 8) return;
    setLookingUp(true);
    try {
      const result = await lookupCompanyByICO(ico);
      if (result) {
        setName(result.name || name);
        setDic(result.dic || dic);
        setIcdph(result.icdph || icdph);
        setStreet(result.street || street);
        setCity(result.city || city);
        setZip(result.zip || zip);
        setCountry(result.country || country);
      }
    } catch (err) {
      console.error("ICO lookup failed:", err);
    }
    setLookingUp(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert("Zadajte nazov partnera");
      return;
    }

    setSaving(true);
    try {
      const partnerData = {
        name: name.trim(),
        ico: ico.trim(),
        dic: dic.trim(),
        icdph: icdph.trim(),
        street: street.trim(),
        city: city.trim(),
        zip: zip.trim(),
        country: country.trim(),
        phone: phone.trim(),
        email: email.trim(),
        iban: iban.trim(),
        source: (partner?.source || "MANUAL") as PartnerSource,
      };

      if (partner) {
        await updatePartner(partner.id, partnerData);
      } else {
        await createPartner(partnerData);
      }

      onClose();
    } catch (err) {
      console.error("Save failed:", err);
      alert("Nepodarilo sa ulozit partnera");
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-900">
            {partner ? "Upravit partnera" : "Novy partner"}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">ICO</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="12345678"
                value={ico}
                onChange={(e) => setIco(e.target.value.replace(/\D/g, "").slice(0, 8))}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
              />
              <button
                type="button"
                onClick={handleLookupICO}
                disabled={lookingUp || ico.length < 8}
                className="px-4 py-2.5 rounded-xl bg-slate-900 text-white font-medium hover:bg-slate-800 disabled:opacity-50"
              >
                {lookingUp ? "Hladam..." : "Vyhladat v registri"}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nazov firmy</label>
            <input
              type="text"
              placeholder="Nazov s.r.o."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">DIC</label>
              <input
                type="text"
                placeholder="2012345678"
                value={dic}
                onChange={(e) => setDic(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">IC DPH</label>
              <input
                type="text"
                placeholder="SK2012345678"
                value={icdph}
                onChange={(e) => setIcdph(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
              />
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <h3 className="font-medium text-slate-700 mb-3">Adresa</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Ulica a cislo</label>
                <input
                  type="text"
                  placeholder="Hlavna 1"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">PSC</label>
                  <input
                    type="text"
                    placeholder="821 01"
                    value={zip}
                    onChange={(e) => setZip(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Mesto</label>
                  <input
                    type="text"
                    placeholder="Bratislava"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Krajina</label>
                  <input
                    type="text"
                    placeholder="Slovensko"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <h3 className="font-medium text-slate-700 mb-3">Kontakt</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  placeholder="info@firma.sk"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Telefon</label>
                <input
                  type="tel"
                  placeholder="+421..."
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <label className="block text-sm font-medium text-slate-700 mb-1">IBAN</label>
            <input
              type="text"
              placeholder="SK89..."
              value={iban}
              onChange={(e) => setIban(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50"
            >
              Zrusit
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-3 rounded-xl bg-slate-900 text-white font-medium hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? "Ukladam..." : partner ? "Ulozit" : "Pridat"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
