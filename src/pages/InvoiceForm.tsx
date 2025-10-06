// src/pages/InvoiceForm.tsx
import { useMemo, useRef, useState } from "react";
import { collection, doc, setDoc } from "firebase/firestore";
import { db } from "@/firebase";
import { v4 as uuid } from "uuid";
import type { Company, Invoice, InvoiceItem, PaymentMethod, Unit } from "@/lib/types";
import { getCompanyByICO, upsertCompany } from "@/lib/companyStore";
import { useUser } from "@/components/AuthGate";

/* ───────────────── Types & utils ───────────────── */
type DocKind = "INVOICE" | "INCOME" | "EXPENSE";

type Entry = {
  id: string;
  kind: "INCOME" | "EXPENSE";
  date: string;
  amount: number;
  note?: string;
  counterparty?: {
    ico?: string;
    name?: string;
    dic?: string | null;
    street?: string | null;
    city?: string | null;
    zip?: string | null;
    country?: string | null;
  } | null;
  payment?: {
    method?: PaymentMethod;
    iban?: string | null;
    variableSymbol?: string | null;
  } | null;
  createdBy: string;
  createdAt: number;
  currency: "EUR";
};

/** UI verzia položky – ceny/množstvá držíme ako TEXT, aby šlo písať "18.5" aj "18,5". */
type ItemUI = {
  id: string;
  title: string;      // Položka
  desc: string;       // Popis
  unit: Unit;         // MJ
  unitPrice: string;  // Jedn. cena (text)
  qty: string;        // Množstvo (text)
  vatRate?: string;   // DPH % (text)
};

const UNITS: Unit[] = ["ks", "hod", "kg", "l", "bal", "sada", "mesačne", "paušál"];
const eur = (n: number) => new Intl.NumberFormat("sk-SK", { style: "currency", currency: "EUR" }).format(n);
const todayISO = () => new Date().toISOString().slice(0, 10);
const onlyDigits = (s: string) => (s || "").replace(/\D+/g, "");
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
/** prijme "18,5" aj "18.5" aj "18." počas písania (posledné spraví 18) */
const parseDec = (v: string | number | undefined): number =>
  Number(String(v ?? "").replace(",", ".").replace(/\s+/g, "")) || 0;

// predvyplnené – uprav podľa reality
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
  iban: "SK6911000000002944275764",
};

export default function InvoiceForm() {
  const user = useUser();
  const printRef = useRef<HTMLDivElement>(null);

  const [kind, setKind] = useState<DocKind>("INVOICE");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");

  const [supplier, setSupplier] = useState<Company>(DEFAULT_SUPPLIER);
  const [customer, setCustomer] = useState<Company>({ ico: "", name: "" });

  const [number, setNumber] = useState<string>("");
  const [issueDate, setIssue] = useState(todayISO());
  const [dueDate, setDue] = useState(todayISO());

  const [vatPayer, setVatPayer] = useState(false);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Prevodom");
  const [iban, setIban] = useState<string>(DEFAULT_SUPPLIER.iban || "");
  const [variableSymbol, setVariableSymbol] = useState<string>("");

  // ── POLOŽKY (UI vrstvy) ──
  const [items, setItems] = useState<ItemUI[]>([
    { id: uuid(), title: "Položka", desc: "Tlač etikiet", unit: "hod", unitPrice: "0", qty: "1", vatRate: "0" },
  ]);

  // rýchly zápis bez faktúry
  const [entryAmount, setEntryAmount] = useState<number>(0);
  const [entryParty, setEntryParty] = useState<Company>({ ico: "", name: "" });

  /* ───────────── Vyhľadanie podľa IČO ───────────── */
  async function lookupByICOInvoice() {
    const ico = onlyDigits(customer.ico).slice(0, 8);
    if (!/^\d{8}$/.test(ico)) { alert("Zadaj platné 8-miestne IČO."); return; }
    const found = await getCompanyByICO(ico);
    if (found) setCustomer({ ...customer, ...found, ico });
    else alert("Firma sa nenašla v tvojej databáze. Po uložení sa zapamätá.");
  }
  async function lookupByICOEntry() {
    const ico = onlyDigits(entryParty.ico || "").slice(0, 8);
    if (!/^\d{8}$/.test(ico)) { alert("Zadaj platné 8-miestne IČO."); return; }
    const found = await getCompanyByICO(ico);
    if (found) setEntryParty({ ...entryParty, ...found, ico });
    else alert("Firma sa nenašla v tvojej databáze. Po uložení sa zapamätá.");
  }

  /* ───────────── Prepočty ───────────── */
  const lineTotals = useMemo(
    () =>
      items.map((it) => ({
        id: it.id,
        total: round2(parseDec(it.qty) * parseDec(it.unitPrice)),
      })),
    [items]
  );

  const totals = useMemo(() => {
    const base = round2(lineTotals.reduce((a, r) => a + r.total, 0));
    const vat = vatPayer
      ? round2(items.reduce((a, it) => a + (parseDec(it.qty) * parseDec(it.unitPrice)) * ((parseDec(it.vatRate) || 0) / 100), 0))
      : 0;
    const gross = round2(base + vat);
    return { base, vat, gross };
  }, [items, vatPayer, lineTotals]);

  /* ───────────── Riadky ───────────── */
  function addItem() {
    setItems((p) => [
      ...p,
      { id: uuid(), title: "", desc: "", unit: "ks", unitPrice: "0", qty: "1", vatRate: vatPayer ? "20" : "0" },
    ]);
  }
  function updateItem(id: string, patch: Partial<ItemUI>) {
    setItems((p) => p.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }
  function removeItem(id: string) {
    setItems((p) => p.filter((it) => it.id !== id));
  }

  /* ───────────── Uloženia ───────────── */
  async function saveInvoice() {
    if (!user) return;
    if (!customer.name || !customer.ico) {
      alert("Doplň IČO a názov odberateľa pre faktúru.");
      return;
    }
    const normCustomer = { ...customer, ico: onlyDigits(customer.ico).slice(0, 8) };
    await upsertCompany(normCustomer);

    const id = uuid();
    const normalizedNumber = number?.trim();
    const normalizedVS =
      (variableSymbol?.trim() || (normalizedNumber ? onlyDigits(normalizedNumber) : "")) || "";

    // mapovanie ItemUI -> InvoiceItem (name = „Položka — Popis“)
    const mappedItems: InvoiceItem[] = items.map((it) => ({
      id: it.id,
      name: [it.title, it.desc].filter(Boolean).join(" — "),
      qty: parseDec(it.qty),
      unit: it.unit,
      unitPrice: parseDec(it.unitPrice),
      vatRate: vatPayer ? (parseDec(it.vatRate) || 0) : 0,
    }));

    const inv: (Partial<Invoice> & { id: string; createdBy: string; createdAt: number }) = {
      id,
      ...(normalizedNumber ? { number: normalizedNumber } : {}),
      issueDate,
      dueDate,
      supplier,
      customer: normCustomer,
      currency: "EUR",
      items: mappedItems,
      note,
      logoUrl: "/images/gpcs.png", // ← public/images/gpcs.png
      payment: {
        method: paymentMethod,
        iban: iban || supplier.iban,
        variableSymbol: normalizedVS || undefined,
      },
      vatPayer,
      totals,
      createdBy: user.uid,
      createdAt: Date.now(),
    };

    const ref = doc(collection(db, "invoices"), id);
    await setDoc(ref, inv, { merge: true });
    alert("Faktúra uložená.");
    window.open(`/invoices/preview/${id}`, "_blank");
  }

  async function saveEntry() {
    if (!user) return;
    if (!entryAmount || entryAmount <= 0) { alert("Zadaj kladnú sumu."); return; }
    const normParty =
      entryParty && (entryParty.ico || entryParty.name)
        ? { ...entryParty, ico: entryParty.ico ? onlyDigits(entryParty.ico).slice(0, 8) : undefined }
        : undefined;

    if (normParty && (normParty.ico || normParty.name)) await upsertCompany(normParty as Company);

    const entry: Entry = {
      id: uuid(),
      kind: kind === "INCOME" ? "INCOME" : "EXPENSE",
      date,
      amount: Number(entryAmount),
      note,
      counterparty: normParty
        ? {
            ico: normParty.ico,
            name: normParty.name || undefined,
            dic: normParty.dic || null,
            street: normParty.street || null,
            city: normParty.city || null,
            zip: normParty.zip || null,
            country: normParty.country || null,
          }
        : null,
      payment: {
        method: paymentMethod,
        iban: iban || null,
        variableSymbol: (variableSymbol || "").trim() || null,
      },
      createdBy: user.uid,
      createdAt: Date.now(),
      currency: "EUR",
    };

    const ref = doc(collection(db, "entries"), entry.id);
    await setDoc(ref, entry, { merge: true });
    alert(kind === "INCOME" ? "Príjem uložený." : "Výdaj uložený.");
  }

  /* ───────────── Tlač / Uloženie / Stiahnutie ───────────── */
  function makeFileName(ext: string) {
    const safeNum = number?.trim() ? number.trim().replace(/[^\w.-]/g, "_") : "";
    const base = safeNum || `faktura_${issueDate}`;
    return `${base}.${ext}`;
  }

  /** Stabilná tlač: hidden iframe + srcdoc + <base href> kvôli logu */
  function openPrint() {
  const html = renderPrintableHTML(printRef.current?.innerHTML || "", window.location.origin);

  const iframe: HTMLIFrameElement = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  // --- jediný cleanup bez parentNode ---
  const cleanup = () => {
    const rm = (iframe as any).remove as (() => void) | undefined;
    if (typeof rm === "function") {
      rm();
    } else if (document.body.contains(iframe)) {
      document.body.removeChild(iframe);
    }
  };

  const onLoad = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      setTimeout(cleanup, 1000);
    }
  };

  if ("srcdoc" in iframe) {
    // najtolerantnejšie priradenie – bez vlnoviek
    iframe.onload = onLoad as (this: GlobalEventHandlers, ev: Event) => any;
    iframe.srcdoc = html;
  } else {
    const anyFrame = iframe as unknown as {
      contentDocument?: Document | null;
      contentWindow?: (Window & { document?: Document | undefined }) | null;
    };
    const doc: Document | null =
      anyFrame.contentDocument ?? anyFrame.contentWindow?.document ?? null;

   if (!doc) { cleanup(); return; }

// presná signatúra -> žiadne červené vlnovky
const handleLoad = (_e: Event) => onLoad();

// TS-safe: pretypuj iframe na EventTarget, listener na EventListener a options na AddEventListenerOptions
(iframe as EventTarget).addEventListener(
  "load",
  handleLoad as EventListener,
  { once: true } as AddEventListenerOptions
);

doc.open();
doc.write(html);
doc.close();
  }
}





  /** Otvorí náhľad do nového tabu – môžeš dať „Save Page As…“ alebo vytlačiť do PDF */
  function openPreviewTab() {
    const html = renderPrintableHTML(printRef.current?.innerHTML || "", window.location.origin);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  /** Priame stiahnutie HTML súboru s náhľadom (vrátane CSS a loga) */
  function downloadHTML() {
    const html = renderPrintableHTML(printRef.current?.innerHTML || "", window.location.origin);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = makeFileName("html");
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const isInvoice = kind === "INVOICE";

  /* ───────────── UI ───────────── */
  return (
    <div style={{ maxWidth: 1300, margin: "0 auto", padding: 16 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Nový doklad</h1>

      <style>{`
        @media (min-width: 1024px) {
          .layout-2col { display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 16px; align-items: start; }
          .sticky-preview { position: sticky; top: 12px; }
        }
      `}</style>

      <div className="layout-2col">
        {/* LEFT */}
        <div>
          <section style={{ marginTop: 8 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              <SegButton active={isInvoice} onClick={() => setKind("INVOICE")}>Faktúra</SegButton>
              <SegButton active={kind === "INCOME"} onClick={() => setKind("INCOME")}>Príjem</SegButton>
              <SegButton active={kind === "EXPENSE"} onClick={() => setKind("EXPENSE")}>Výdaj</SegButton>
            </div>
          </section>

          <section style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginTop: 12 }}>
            <Text label="Dátum" type="date" value={isInvoice ? issueDate : date} onChange={(v) => (isInvoice ? setIssue(v) : setDate(v))} />
            <Text label="Poznámka" value={note} onChange={setNote} />
          </section>

          {isInvoice ? (
            <>
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
                  <Text
                    label="IBAN"
                    value={supplier.iban || ""}
                    onChange={(v) => {
                      setSupplier({ ...supplier, iban: v });
                      if (!iban) setIban(v);
                    }}
                  />
                </Fieldset>

                <Fieldset title="Odberateľ">
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "end" }}>
                    <Text
                      label="IČO"
                      value={customer.ico}
                      onChange={(v) => setCustomer({ ...customer, ico: onlyDigits(v).slice(0, 8) })}
                    />
                    <button onClick={lookupByICOInvoice} style={btnOutline}>Nájsť podľa IČO</button>
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

              {/* Čísla / dátumy / DPH */}
              <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginTop: 12 }}>
                <Text
                  label="Číslo faktúry (nepovinné)"
                  value={number}
                  onChange={(v) => {
                    setNumber(v);
                    const digits = onlyDigits(v);
                    setVariableSymbol(digits || "");
                  }}
                />
                <Text label="Vystavená" type="date" value={issueDate} onChange={setIssue} />
                <Text label="Splatnosť" type="date" value={dueDate} onChange={setDue} />
                <Checkbox label="Som platiteľ DPH" checked={vatPayer} onChange={setVatPayer} />
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
              <section style={{ marginTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={{ margin: 0 }}>Položky</h3>
                  <button onClick={addItem} style={{ ...btn, background: "#0f172a" }}>+ Pridať položku</button>
                </div>

                <ItemsHeader />

                {items.map((it) => {
                  const line = lineTotals.find((l) => l.id === it.id)?.total || 0;
                  return (
                    <div
                      key={it.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1.2fr 2fr 0.8fr 1fr 0.9fr 0.9fr auto",
                        gap: 8,
                        alignItems: "center",
                        padding: "6px 8px",
                        border: "1px solid #e5e7eb",
                        borderRadius: 10,
                        marginBottom: 6,
                        background: "#fff",
                      }}
                    >
                      {/* 1) Položka */}
                      <input
                        placeholder="Položka"
                        value={it.title}
                        onChange={(e) => updateItem(it.id, { title: e.target.value })}
                        style={cellInput}
                      />
                      {/* 2) Popis */}
                      <input
                        placeholder="Popis"
                        value={it.desc}
                        onChange={(e) => updateItem(it.id, { desc: e.target.value })}
                        style={cellInput}
                      />
                      {/* 3) MJ */}
                      <select
                        value={it.unit}
                        onChange={(e) => updateItem(it.id, { unit: e.target.value as Unit })}
                        style={cellInput}
                      >
                        {UNITS.map((u) => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                      {/* 4) Jedn. cena */}
                      <NumericInput
                        placeholder="Jedn. cena"
                        value={it.unitPrice}
                        onChange={(v) => updateItem(it.id, { unitPrice: v })}
                      />
                      {/* 5) Množstvo */}
                      <NumericInput
                        placeholder="Množstvo"
                        value={it.qty}
                        onChange={(v) => updateItem(it.id, { qty: v })}
                      />
                      {/* 6) Medzisúčet */}
                      <div style={{ fontWeight: 700, textAlign: "right" }}>{eur(line)}</div>
                      {/* Delete */}
                      <button onClick={() => removeItem(it.id)} style={btnDanger}>Zmazať</button>
                    </div>
                  );
                })}

                {!vatPayer && (
                  <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                    Nie som platiteľ DPH podľa zákona o DPH.
                  </div>
                )}

                {/* Súhrn */}
                <section style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", marginTop: 12 }}>
                  <div />
                  <div style={{ textAlign: "right" }}>
                    <div>Základ: <strong>{eur(totals.base)}</strong></div>
                    {vatPayer && <div>DPH: <strong>{eur(totals.vat)}</strong></div>}
                    <div style={{ fontSize: 22, fontWeight: 800 }}>Spolu: {eur(totals.gross)}</div>
                  </div>
                </section>

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
                  <button onClick={openPrint} style={btnOutline}>Tlačiť / Uložiť do PDF</button>
                  <button onClick={openPreviewTab} style={btnOutline}>Otvoriť náhľad v novom okne</button>
                  <button onClick={downloadHTML} style={btnOutline}>Stiahnuť HTML</button>
                  <button onClick={saveInvoice} style={btn}>Uložiť faktúru</button>
                </div>
              </section>
            </>
          ) : (
            <>
              {/* Rýchly príjem/výdaj */}
              <Fieldset title={kind === "INCOME" ? "Príjem bez faktúry" : "Výdaj bez faktúry"}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                  <Text label="Suma" value={String(entryAmount)} onChange={(v) => setEntryAmount(parseDec(v))} />
                  <Select
                    label="Forma úhrady"
                    value={paymentMethod}
                    onChange={(v) => setPaymentMethod(v as PaymentMethod)}
                    options={["Hotovosť", "Prevodom", "Platobná karta", "Iné"]}
                  />
                  <Text label="Variabilný symbol (nepovinné)" value={variableSymbol} onChange={(v) => setVariableSymbol(onlyDigits(v))} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 12 }}>
                  <Text label="IBAN (nepovinné)" value={iban} onChange={setIban} />
                  <Text label="Poznámka" value={note} onChange={setNote} />
                  <Text label="Dátum" type="date" value={date} onChange={setDate} />
                </div>
              </Fieldset>

              <Fieldset title="Protistrana (nepovinné)">
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "end" }}>
                  <Text
                    label="IČO"
                    value={entryParty.ico || ""}
                    onChange={(v) => setEntryParty({ ...entryParty, ico: onlyDigits(v).slice(0, 8) })}
                  />
                  <button onClick={lookupByICOEntry} style={btnOutline}>Nájsť podľa IČO</button>
                </div>
                <Text label="Názov" value={entryParty.name || ""} onChange={(v) => setEntryParty({ ...entryParty, name: v })} />
                <Text label="DIČ" value={entryParty.dic || ""} onChange={(v) => setEntryParty({ ...entryParty, dic: v })} />
                <Text label="Ulica" value={entryParty.street || ""} onChange={(v) => setEntryParty({ ...entryParty, street: v })} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <Text label="PSČ" value={entryParty.zip || ""} onChange={(v) => setEntryParty({ ...entryParty, zip: v })} />
                  <Text label="Mesto" value={entryParty.city || ""} onChange={(v) => setEntryParty({ ...entryParty, city: v })} />
                </div>
              </Fieldset>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
                <button onClick={saveEntry} style={btn}>Uložiť {kind === "INCOME" ? "príjem" : "výdaj"}</button>
              </div>
            </>
          )}
        </div>

        {/* RIGHT – PREVIEW */}
        <div className="sticky-preview">
          <PreviewCard
            refEl={printRef}
            supplier={supplier}
            customer={customer}
            issueDate={issueDate}
            dueDate={dueDate}
            number={number}
            items={items}
            lineTotals={lineTotals}
            totals={totals}
            vatPayer={vatPayer}
            note={note}
            payment={{ method: paymentMethod, iban, variableSymbol }}
          />
        </div>
      </div>
    </div>
  );
}

/* ───────────────── UI helpers ───────────────── */
function Fieldset({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, marginTop: 12, background: "#fafafa" }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>{title}</div>
      <div style={{ display: "grid", gap: 8 }}>{children}</div>
    </div>
  );
}
function Text({ label, value, onChange, type = "text" }:{
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <label style={{ display: "grid", gap: 4 }}>
      <span style={{ fontSize: 12, color: "#374151" }}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ border: "1px solid #d1d5db", borderRadius: 10, padding: 10, background: "#fff" }}
      />
    </label>
  );
}
function Select({ label, value, onChange, options }:{
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <label style={{ display: "grid", gap: 4 }}>
      <span style={{ fontSize: 12, color: "#374151" }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ border: "1px solid #d1d5db", borderRadius: 10, padding: 10, background: "#fff" }}
      >
        {options.map(op => <option key={op} value={op}>{op}</option>)}
      </select>
    </label>
  );
}
function Checkbox({ label, checked, onChange }:{ label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "grid", gap: 6, alignContent: "start" }}>
      <span style={{ fontSize: 12, color: "#374151" }}>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
function SegButton({ active, onClick, children }:{ active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} style={{ ...segBtn, ...(active ? segBtnActive : {}) }}>{children}</button>;
}

/** Editovateľný numerický input – podporuje „,“ aj „.“ a nechá ťa pohodlne písať 18.5 */
function NumericInput({
  value,
  onChange,
  placeholder,
  integer = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  integer?: boolean;
}) {
  return (
    <input
      type="text"
      inputMode="decimal"
      placeholder={placeholder}
      value={value}
      onChange={(e) => {
        const raw = e.target.value.replace(",", "."); // unify , -> .
        // povoliť len čísla, bodku a max 1 bodku
        let cleaned = raw.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
        if (integer) cleaned = cleaned.replace(/\..*$/, "");
        onChange(cleaned);
      }}
      style={cellInput}
    />
  );
}

function ItemsHeader() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1.2fr 2fr 0.8fr 1fr 0.9fr 0.9fr auto",
        gap: 8,
        fontSize: 12,
        fontWeight: 700,
        color: "#6b7280",
        padding: "0 6px",
        marginTop: 8,
        marginBottom: 4,
      }}
    >
      <div>Položka</div>
      <div>Popis</div>
      <div>MJ</div>
      <div>Jedn. cena</div>
      <div>Množstvo</div>
      <div style={{ textAlign: "right" }}>Medzisúčet</div>
      <div />
    </div>
  );
}

function PreviewCard({
  refEl,
  supplier,
  customer,
  issueDate,
  dueDate,
  number,
  items,
  lineTotals,
  totals,
  vatPayer,
  note,
  payment,
}: {
  refEl: React.MutableRefObject<HTMLDivElement | null>;
  supplier: Company;
  customer: Company;
  issueDate: string;
  dueDate: string;
  number?: string;
  items: ItemUI[];
  lineTotals: { id: string; total: number }[];
  totals: { base: number; vat: number; gross: number };
  vatPayer: boolean;
  note: string;
  payment: { method: string; iban?: string; variableSymbol?: string };
}) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>Náhľad faktúry</div>

      <div ref={refEl as any} id="print-root">
        <style>{`
          .inv-table { width: 100%; border-collapse: collapse; }
          .inv-table th, .inv-table td { border-bottom: 1px solid #e5e7eb; padding: 8px; text-align: left; }
          .inv-small { color: #6b7280; font-size: 12px; }
          .inv-right { text-align: right; }
          .inv-h1 { font-size: 22px; font-weight: 800; margin: 0 0 8px 0; }
          .inv-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
          @media print { body { margin: 0; } .page { margin: 12mm; } }
        `}</style>

        <div className="page">
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <img src="/images/gpcs.png" alt="Logo" style={{ height: 40 }} />
            <div className="inv-h1">Faktúra {number ? `#${number}` : ""}</div>
          </div>

          <div className="inv-grid">
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Dodávateľ</div>
              <div>{supplier.name}</div>
              <div className="inv-small">IČO: {supplier.ico} · DIČ: {supplier.dic}</div>
              <div className="inv-small">{supplier.street}, {supplier.zip} {supplier.city}</div>
              <div className="inv-small">{supplier.country}</div>
              {supplier.email && <div className="inv-small">{supplier.email}</div>}
            </div>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Odberateľ</div>
              <div>{customer.name || <span className="inv-small">—</span>}</div>
              <div className="inv-small">IČO: {customer.ico || "—"} · DIČ: {customer.dic || "—"}</div>
              <div className="inv-small">{[customer.street, customer.zip, customer.city].filter(Boolean).join(", ") || "—"}</div>
            </div>
          </div>

          <div className="inv-grid" style={{ marginTop: 12 }}>
            <div className="inv-small">Vystavená: <strong>{issueDate}</strong></div>
            <div className="inv-small">Splatnosť: <strong>{dueDate}</strong></div>
          </div>

          <table className="inv-table" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th>Položka</th>
                <th>Popis</th>
                <th>MJ</th>
                <th className="inv-right">Jedn. cena</th>
                <th className="inv-right">Množstvo</th>
                <th className="inv-right">Medzisúčet</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const line = lineTotals.find((l) => l.id === it.id)?.total || 0;
                return (
                  <tr key={it.id}>
                    <td>{it.title || "—"}</td>
                    <td>{it.desc || "—"}</td>
                    <td>{it.unit}</td>
                    <td className="inv-right">{eur(parseDec(it.unitPrice))}</td>
                    <td className="inv-right">{parseDec(it.qty)}</td>
                    <td className="inv-right">{eur(line)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", marginTop: 12 }}>
            <div className="inv-small">
              {payment?.iban && <>IBAN: <strong>{payment.iban}</strong><br /></>}
              {payment?.variableSymbol && <>VS: <strong>{payment.variableSymbol}</strong><br /></>}
              Forma úhrady: <strong>{payment?.method || "—"}</strong><br />
              {!vatPayer && <>Nie som platiteľ DPH podľa zákona o DPH.</>}
              {note && (<><br />Poznámka: {note}</>)}
            </div>
            <div>
              <div className="inv-small">Základ: <strong>{eur(totals.base)}</strong></div>
              {vatPayer && <div className="inv-small">DPH: <strong>{eur(totals.vat)}</strong></div>}
              <div style={{ fontSize: 18, fontWeight: 800, textAlign: "right", marginTop: 6 }}>
                Spolu: {eur(totals.gross)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
        <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} style={btnOutline}>Prejsť hore</button>
      </div>
    </div>
  );
}

/* ───────────────── štýly ───────────────── */
const btn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  background: "#111827",
  color: "#fff",
  border: "none",
  cursor: "pointer",
};
const btnOutline: React.CSSProperties = { ...btn, background: "transparent", color: "#111827", border: "1px solid #d1d5db" };
const btnDanger: React.CSSProperties = { ...btn, background: "#dc2626" };
const segBtn: React.CSSProperties = { padding: "10px 12px", borderRadius: 10, border: "1px solid #d1d5db", background: "white", cursor: "pointer", fontWeight: 600 };
const segBtnActive: React.CSSProperties = { background: "#111827", color: "white", borderColor: "#111827" };
const cellInput: React.CSSProperties = { border: "1px solid #d1d5db", borderRadius: 10, padding: "8px 10px", background: "#fff" };

/* ───────────────── helpers ───────────────── */
/**
 * Vráti kompletné HTML s <base href="...">, aby /images/gpcs.png išlo aj v blob/iframe kontexte.
 * Do BODY sa vloží presne to, čo je v náhľade (vrátane CSS zo <style> v PreviewCard).
 */
function renderPrintableHTML(inner: string, origin = "") {
  const baseHref = origin || (typeof window !== "undefined" ? window.location.origin : "");
  return `<!DOCTYPE html>
<html lang="sk">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Faktúra – náhľad</title>
<base href="${baseHref}">
<style>
@page { size: A4; margin: 12mm; }
html, body { background:#fff; color:#111827; font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Helvetica Neue, Noto Sans, Arial, Apple Color Emoji, Segoe UI Emoji; }
</style>
</head>
<body>
${inner}
</body>
</html>`;
}

