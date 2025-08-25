// src/pages/InvoiceForm.tsx
import { useMemo, useState } from "react";
import { collection, doc, setDoc } from "firebase/firestore";
import { db } from "@/firebase";
import { v4 as uuid } from "uuid";
import type { Company, Invoice, InvoiceItem, Unit, PaymentMethod } from "@/lib/types";
import { getCompanyByICO, upsertCompany } from "@/lib/companyStore";
import { useUser } from "@/components/AuthGate";

const UNITS: Unit[] = ["ks","hod","kg","l","bal","sada","mesačne","paušál"];
const eur = (n: number) => new Intl.NumberFormat("sk-SK", { style: "currency", currency: "EUR" }).format(n);
const todayISO = () => new Date().toISOString().slice(0, 10);
const onlyDigits = (s: string) => (s || "").replace(/\D+/g, "");

// predvyplnené údaje dodávateľa – uprav podľa reality
const DEFAULT_SUPPLIER: Company = {
  ico: "57 150 061",
  name: "GPCS s.r.o. – Global Printing and Control Solutions",
  dic: "2123456789",
  street: "Doležalova 15C",
  city: "Bratislava",
  zip: "821 04",
  country: "Slovensko",
  phone: "+421950889523",
  email: "info@gpcs.sk",
  iban: "SK7075000000004034692349",
};

export default function InvoiceForm() {
  const user = useUser();
  const [supplier, setSupplier] = useState<Company>(DEFAULT_SUPPLIER);
  const [customer, setCustomer] = useState<Company>({ ico: "", name: "" });

  const [number, setNumber]   = useState("2025010");
  const [issueDate, setIssue] = useState(todayISO());
  const [dueDate, setDue]     = useState(todayISO());
  const [note, setNote]       = useState("");

  // nie si platiteľ -> default false
  const [vatPayer, setVatPayer] = useState(false);

  // platobné údaje
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Prevodom");
  const [iban, setIban] = useState<string>(supplier.iban || "");
  const [variableSymbol, setVariableSymbol] = useState<string>(onlyDigits(number));

  const [items, setItems] = useState<InvoiceItem[]>([
    { id: uuid(), name: "", qty: 1, unit: "ks", unitPrice: 0, vatRate: 0 },
  ]);

  async function lookupByICO() {
    const ico = onlyDigits(customer.ico);
    if (!/^\d{8}$/.test(ico)) { alert("Zadaj platné 8-miestne IČO."); return; }
    const found = await getCompanyByICO(ico);
    if (found) setCustomer({ ...customer, ...found });
    else alert("Firma sa nenašla v tvojej databáze. Po uložení sa zapamätá.");
  }

  const totals = useMemo(() => {
    const base = items.reduce((a, it) => a + it.qty * it.unitPrice, 0);
    const vat  = vatPayer ? items.reduce((a, it) => a + it.qty * it.unitPrice * ((it.vatRate ?? 0) / 100), 0) : 0;
    const gross = base + vat;
    return { base, vat, gross };
  }, [items, vatPayer]);

  function addItem() {
    setItems(p => [...p, { id: uuid(), name: "", qty: 1, unit: "ks", unitPrice: 0, vatRate: vatPayer ? 20 : 0 }]);
  }
  function updateItem(id: string, patch: Partial<InvoiceItem>) {
    setItems(p => p.map(it => (it.id === id ? { ...it, ...patch } : it)));
  }
  function removeItem(id: string) {
    setItems(p => p.filter(it => it.id !== id));
  }

  async function saveInvoice() {
    if (!user) return;
    if (!customer.name || !customer.ico) { alert("Doplň IČO a názov odberateľa."); return; }

    await upsertCompany(customer);

    const inv: Invoice = {
      id: uuid(),
      number,
      issueDate,
      dueDate,
      supplier,
      customer,
      currency: "EUR",
      items: items.map(it => ({ ...it, vatRate: vatPayer ? (it.vatRate ?? 0) : 0 })),
      note,
      logoUrl: "/images/gpcs.png",
      payment: {
        method: paymentMethod,
        iban: iban || supplier.iban,
        variableSymbol: variableSymbol || onlyDigits(number),
      },
      vatPayer,
      totals,
      createdBy: user.uid,
      createdAt: Date.now(),
    };

    const ref = doc(collection(db, "invoices"), inv.id);
    await setDoc(ref, inv, { merge: true });
    alert("Faktúra uložená.");
    window.open(`/invoices/preview/${inv.id}`, "_blank");
  }

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: 16 }}>
      <h1>Nová faktúra</h1>

      {/* Dodávateľ / Odberateľ */}
      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Fieldset title="Dodávateľ">
          <Text label="Názov" value={supplier.name} onChange={(v) => setSupplier({ ...supplier, name: v })} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Text label="IČO" value={supplier.ico} onChange={(v) => setSupplier({ ...supplier, ico: v })} />
            <Text label="DIČ" value={supplier.dic || ""} onChange={(v) => setSupplier({ ...supplier, dic: v })} />
          </div>
          <Text label="Ulica" value={supplier.street || ""} onChange={(v) => setSupplier({ ...supplier, street: v })} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Text label="PSČ" value={supplier.zip || ""} onChange={(v) => setSupplier({ ...supplier, zip: v })} />
            <Text label="Mesto" value={supplier.city || ""} onChange={(v) => setSupplier({ ...supplier, city: v })} />
          </div>
          <Text label="Telefón" value={supplier.phone || ""} onChange={(v) => setSupplier({ ...supplier, phone: v })} />
          <Text label="E-mail" value={supplier.email || ""} onChange={(v) => setSupplier({ ...supplier, email: v })} />
          <Text label="IBAN" value={supplier.iban || ""} onChange={(v) => { setSupplier({ ...supplier, iban: v }); if (!iban) setIban(v); }} />
        </Fieldset>

        <Fieldset title="Odberateľ">
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "end" }}>
            <Text label="IČO" value={customer.ico} onChange={(v) => setCustomer({ ...customer, ico: v })} />
            <button onClick={lookupByICO} style={btnOutline}>Nájsť podľa IČO</button>
          </div>
          <Text label="Názov" value={customer.name} onChange={(v) => setCustomer({ ...customer, name: v })} />
          <Text label="DIČ" value={customer.dic || ""} onChange={(v) => setCustomer({ ...customer, dic: v })} />
          <Text label="Ulica" value={customer.street || ""} onChange={(v) => setCustomer({ ...customer, street: v })} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Text label="PSČ" value={customer.zip || ""} onChange={(v) => setCustomer({ ...customer, zip: v })} />
            <Text label="Mesto" value={customer.city || ""} onChange={(v) => setCustomer({ ...customer, city: v })} />
          </div>
        </Fieldset>
      </section>

      {/* Čísla / dátumy / DPH prepínač */}
      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginTop: 16 }}>
        <Text label="Číslo faktúry" value={number} onChange={(v) => { setNumber(v); setVariableSymbol(onlyDigits(v)); }} />
        <Text label="Vystavená" type="date" value={issueDate} onChange={setIssue} />
        <Text label="Splatnosť" type="date" value={dueDate} onChange={setDue} />
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, color: "#374151" }}>Som platiteľ DPH</span>
          <input type="checkbox" checked={vatPayer} onChange={(e) => setVatPayer(e.target.checked)} />
        </label>
      </section>

      {/* Platobné údaje */}
      <Fieldset title="Platobné údaje">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Text label="IBAN" value={iban} onChange={setIban} />
          <Select
            label="Forma úhrady"
            value={paymentMethod}
            onChange={(v) => setPaymentMethod(v as PaymentMethod)}
            options={["Prevodom", "Hotovosť", "Platobná karta", "Dobierka", "Iné"]}
          />
          <Text label="Variabilný symbol" value={variableSymbol} onChange={(v) => setVariableSymbol(onlyDigits(v))} />
        </div>
      </Fieldset>

      {/* Položky */}
      <section style={{ marginTop: 16 }}>
        <h3>Položky</h3>
        <div style={{ display: "grid", gap: 8 }}>
          {items.map((it) => (
            <div key={it.id}
                 style={{
                   display: "grid",
                   gridTemplateColumns: vatPayer
                     ? "1fr 2fr 1fr 1fr 1fr auto"
                     : "1fr 2fr 1fr 1fr auto",
                   gap: 8
                 }}>
              <input placeholder="Počet" type="number" step="0.01" value={it.qty}
                     onChange={(e) => updateItem(it.id, { qty: Number(e.target.value) || 0 })}/>
              <input placeholder="Popis" value={it.name}
                     onChange={(e) => updateItem(it.id, { name: e.target.value })} />
              <select value={it.unit} onChange={(e) => updateItem(it.id, { unit: e.target.value as Unit })}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
              <input type="number" step="0.01" placeholder="Jedn. cena bez DPH" value={it.unitPrice}
                     onChange={(e) => updateItem(it.id, { unitPrice: Number(e.target.value) || 0 })}/>
              {vatPayer && (
                <input type="number" step="1" placeholder="DPH %" value={it.vatRate ?? 0}
                       onChange={(e) => updateItem(it.id, { vatRate: Number(e.target.value) || 0 })}/>
              )}
              <button onClick={() => removeItem(it.id)} style={btnDanger}>Zmazať</button>
            </div>
          ))}
        </div>
        <button onClick={addItem} style={{ ...btn, marginTop: 8 }}>+ Pridať položku</button>
      </section>

      <section style={{ marginTop: 16 }}>
        <label>Poznámka</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} style={{ width: "100%", minHeight: 80 }} />
        {!vatPayer && (
          <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>Nie som platiteľ DPH podľa zákona o DPH.</div>
        )}
      </section>

      {/* Súhrn */}
      <section style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", marginTop: 16 }}>
        <div />
        <div style={{ textAlign: "right" }}>
          <div>Základ: <strong>{eur(totals.base)}</strong></div>
          {vatPayer && <div>DPH: <strong>{eur(totals.vat)}</strong></div>}
          <div style={{ fontSize: 22, fontWeight: 800 }}>
            Spolu: {eur(totals.gross)}
          </div>
        </div>
      </section>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
        <button onClick={saveInvoice} style={btn}>Uložiť faktúru</button>
      </div>
    </div>
  );
}

// --- mini UI helpers ---
function Fieldset({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, marginTop: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{title}</div>
      <div style={{ display: "grid", gap: 8 }}>{children}</div>
    </div>
  );
}
function Text({ label, value, onChange, type = "text" }:
  { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label style={{ display: "grid", gap: 4 }}>
      <span style={{ fontSize: 12, color: "#374151" }}>{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
             style={{ border: "1px solid #d1d5db", borderRadius: 10, padding: 10 }}/>
    </label>
  );
}
function Select({ label, value, onChange, options }:{
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <label style={{ display: "grid", gap: 4 }}>
      <span style={{ fontSize: 12, color: "#374151" }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
              style={{ border: "1px solid #d1d5db", borderRadius: 10, padding: 10 }}>
        {options.map(op => <option key={op} value={op}>{op}</option>)}
      </select>
    </label>
  );
}
const btn: React.CSSProperties = { padding: "10px 14px", borderRadius: 10, background: "#111827", color: "#fff", border: "none", cursor: "pointer" };
const btnOutline: React.CSSProperties = { ...btn, background: "transparent", color: "#111827", border: "1px solid #d1d5db" };
const btnDanger: React.CSSProperties = { ...btn, background: "#dc2626" };
