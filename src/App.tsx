// src/App.tsx
import React, { useEffect, useMemo, useState } from "react";
import { db, signOutFirebase } from "@/firebase";
import { doc, onSnapshot, setDoc, getDoc } from "firebase/firestore";
import { Link } from "react-router-dom";
import { useUser } from "@/components/AuthGate";

// ==========================
// Simple UI primitives
// ==========================
function Card(props: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      style={{
        background: "#fff",
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        ...props.style,
      }}
    />
  );
}
function CardHeader(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} style={{ padding: "12px 16px", borderBottom: "1px solid #f1f5f9", ...props.style }} />;
}
function CardTitle(props: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 {...props} style={{ margin: 0, fontSize: 14, fontWeight: 600, ...props.style }} />;
}
function CardContent(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} style={{ padding: 16, ...props.style }} />;
}
function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "outline" | "danger"; block?: boolean }
) {
  const { variant = "solid", style, block, ...rest } = props;
  const base: React.CSSProperties = {
    padding: "10px 14px",
    borderRadius: 10,
    fontSize: 14,
    cursor: "pointer",
    border: "1px solid transparent",
    background: "#111827",
    color: "#fff",
    touchAction: "manipulation",
    width: block ? "100%" : undefined,
  };
  const styles: Record<string, React.CSSProperties> = {
    solid: base,
    outline: { ...base, background: "transparent", color: "#111827", borderColor: "#d1d5db" },
    danger: { ...base, background: "#dc2626" },
  };
  return <button {...rest} style={{ ...styles[variant], ...style }} />;
}

// ==========================
// Types and helpers
// ==========================
type EntryType = "prijem" | "vydavok";
interface Entry {
  id: string;
  type: EntryType;
  date: string;
  docNumber: string;
  company: string;
  amount: number;
}

const FS_DOC_PATH = { col: "gpcs-ucto", id: "app" };
const LS_KEY = "gpcs-bookkeeping-v1";
const COMPANY_FULL = "GPCS s.r.o. – Global Printing and Control Solutions";
const COMPANY_SHORT = "GPCS s.r.o.";

const eur = (n: number) => new Intl.NumberFormat("sk-SK", { style: "currency", currency: "EUR" }).format(n);
const todayISO = () => new Date().toISOString().slice(0, 10);
const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const parseNum = (v: string) => {
  if (!v) return 0;
  let s = v.split("\u00A0").join("");
  s = s.split(" ").join("");
  s = s.replace(",", ".");
  s = Array.from(s)
    .filter((ch) => "0123456789+-.".includes(ch))
    .join("");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
function deriveCompany(finalType: EntryType, company: string | undefined) {
  return finalType === "vydavok" ? COMPANY_SHORT : (company || "").trim();
}
function buildCsv(entries: Entry[], month: string) {
  void month; // zamedzí TS chybe na nepoužitý parameter

  const header = ["id", "typ", "datum", "cislo_dokladu", "firma", "suma"];
  const rows = entries.map((e) =>
    [e.id, e.type, e.date, e.docNumber, e.company, e.amount.toFixed(2).replace(".", ",")]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(";")
  );
  return [header.join(";"), ...rows].join("\r\n");
}

// ==========================
// Hooks
// ==========================
function useIsMobile(breakpointPx = 640) {
  const [isMobile, setIsMobile] = useState<boolean>(() => globalThis.innerWidth <= breakpointPx);
  useEffect(() => {
    const handler = () => setIsMobile(globalThis.innerWidth <= breakpointPx);
    handler();
    globalThis.addEventListener("resize", handler);
    return () => globalThis.removeEventListener("resize", handler);
  }, [breakpointPx]);
  return isMobile;
}

// ==========================
// App
// ==========================
export default function App() {
  const isMobile = useIsMobile();
  const user = useUser();

  const [entries, setEntries] = useState<Entry[]>([]);
  const [tab, setTab] = useState<EntryType>("prijem");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const [form, setForm] = useState<{ type: EntryType; date: string; docNumber: string; company?: string; amount: number }>(
    { type: "prijem", date: todayISO(), docNumber: "", company: "", amount: 0 }
  );

  // Load (prefer Firestore, fallback localStorage)
  useEffect(() => {
    let unsub: undefined | (() => void);
    (async () => {
      try {
        const ref = doc(db, FS_DOC_PATH.col, FS_DOC_PATH.id);
        const snap = await getDoc(ref);
        if (!snap.exists()) await setDoc(ref, { entries: [] });
        unsub = onSnapshot(ref, (s) => {
          const data = s.data();
          if (Array.isArray(data?.entries)) {
            setEntries(data.entries);
            localStorage.setItem(LS_KEY, JSON.stringify({ entries: data.entries }));
          }
        });
      } catch {
        const saved = localStorage.getItem(LS_KEY);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed.entries)) setEntries(parsed.entries as Entry[]);
          } catch {}
        }
      }
    })();
    return () => unsub?.();
  }, []);

  // Persist (try Firestore, else localStorage)
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const ref = doc(db, FS_DOC_PATH.col, FS_DOC_PATH.id);
        await setDoc(ref, { entries }, { merge: true });
      } catch {
        localStorage.setItem(LS_KEY, JSON.stringify({ entries }));
      }
    }, 200);
    return () => clearTimeout(t);
  }, [entries]);

  // Derived
  const monthEntries = useMemo(() => entries.filter((e) => (e.date || "").slice(0, 7) === month), [entries, month]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return monthEntries;
    return monthEntries.filter((e) => [e.docNumber, e.company, e.type].some((v) => String(v).toLowerCase().includes(q)));
  }, [monthEntries, query]);

  const byTypeMonth = (t: EntryType) => monthEntries.filter((e) => e.type === t);
  const totals = useMemo(() => {
    const inc = byTypeMonth("prijem").reduce((a, e) => a + e.amount, 0);
    const exp = byTypeMonth("vydavok").reduce((a, e) => a + e.amount, 0);
    const profit = inc - exp;
    return { inc, exp, profit };
  }, [monthEntries]);

  // Dane
  const EXEC_GROSS = 100;
  const EMP_ZP = 0.10;
  const EMP_SP = 0.352;
  const EXEC_EMP_COST = EXEC_GROSS * (1 + EMP_ZP + EMP_SP); // 145.2
  const CIT_15_THRESHOLD = 60000;
  const CIT_LOW = 0.15;
  const CIT_HIGH = 0.21;

  const currentYear = useMemo(() => month.slice(0, 4), [month]);
  const annualTurnover = useMemo(
    () =>
      entries
        .filter((e) => e.type === "prijem" && (e.date || "").startsWith(currentYear))
        .reduce((a, e) => a + e.amount, 0),
    [entries, currentYear]
  );
  const citRate = annualTurnover <= CIT_15_THRESHOLD ? CIT_LOW : CIT_HIGH;

  const taxCalc = useMemo(() => {
    const profitBeforeExec = totals.profit;
    const employerLevies = EXEC_GROSS * (EMP_ZP + EMP_SP); // 45.2
    const profitAfterExec = profitBeforeExec - (EXEC_GROSS + employerLevies);
    const taxBase = Math.max(0, profitAfterExec);
    const citTax = taxBase * citRate;
    const afterTax = profitAfterExec - citTax;
    return { employerLevies, profitAfterExec, taxBase, citTax, afterTax, rate: citRate };
  }, [totals, citRate]);

  // Actions
  const resetForm = (type: EntryType) => {
    setForm({ type, date: todayISO(), docNumber: "", company: "", amount: 0 });
    setEditingId(null);
  };
  const upsertEntry = (finalType: EntryType) => {
    if (!finalType) return;
    if (!form.date) { alert("Zadaj dátum"); return; }
    if (!form.docNumber.trim()) { alert("Zadaj číslo faktúry"); return; }
    if (finalType === "prijem" && !String(form.company || "").trim()) { alert("Zadaj firmu pri príjme"); return; }
    const amt = Number(form.amount) || 0;
    if (amt <= 0) { alert("Suma musí byť > 0"); return; }
    const clean: Entry = {
      id: editingId ?? uuid(),
      type: finalType,
      date: form.date,
      docNumber: form.docNumber.trim(),
      company: deriveCompany(finalType, form.company),
      amount: amt,
    };
    setEntries((prev) => {
      const exists = prev.some((e) => e.id === clean.id);
      return exists ? prev.map((e) => (e.id === clean.id ? clean : e)) : [clean, ...prev];
    });
    const ym = clean.date.slice(0, 7);
    setMonth(ym);
    setQuery("");
    resetForm(finalType);
  };
  const editEntry = (e: Entry) => {
    setEditingId(e.id);
    setForm({ type: e.type, date: e.date, docNumber: e.docNumber, company: e.company, amount: e.amount });
    setTab(e.type);
  };
  const removeEntry = (id: string) => {
    if (!confirm("Zmazať záznam?")) return;
    setEntries((prev) => prev.filter((e) => e.id !== id));
    if (editingId === id) setEditingId(null);
  };

  // Self-tests
  useEffect(() => {
    const sample: Entry[] = [
      { id: "1", type: "prijem", date: "2025-08-01", docNumber: "F1", company: "A", amount: 100 },
      { id: "2", type: "vydavok", date: "2025-08-02", docNumber: "F2", company: COMPANY_SHORT, amount: 30 },
      { id: "3", type: "prijem", date: "2025-08-05", docNumber: "F3", company: "B", amount: 70 },
    ];
    const inc = sample.filter((x) => x.type === "prijem").reduce((a, e) => a + e.amount, 0);
    const exp = sample.filter((x) => x.type === "vydavok").reduce((a, e) => a + e.amount, 0);
    const profit = inc - exp;
    console.assert(inc === 170, "Test inc failed");
    console.assert(exp === 30, "Test exp failed");
    console.assert(profit === 140, "Test profit failed");
    console.assert(deriveCompany("vydavok", "X") === COMPANY_SHORT, "deriveCompany vydavok failed");
    console.assert(deriveCompany("prijem", "Acme") === "Acme", "deriveCompany prijem failed");
    console.assert(parseNum("1 234,50") === 1234.5, "parseNum space+comma failed");
    console.assert(parseNum("1\u00A0234,50") === 1234.5, "parseNum NBSP failed");
    console.assert(parseNum("1000.75") === 1000.75, "parseNum dot failed");
    const csv = buildCsv(sample, "2025-08");
    console.assert(!csv.startsWith("\uFEFF"), "CSV must not start with BOM");
    const lines = csv.split("\r\n");
    console.assert(lines.length === sample.length + 1, "CSV rows count mismatch");
    console.assert(lines[0] === "id;typ;datum;cislo_dokladu;firma;suma", "CSV header mismatch");
  }, []);

  // ==========================
  // UI
  // ==========================
  const headerTitle = isMobile ? COMPANY_SHORT : COMPANY_FULL;

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundImage: "url('/images/gpcs.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }}
    >
      <div style={{ minHeight: "100vh", background: "rgba(255,255,255,0.86)" }}>
        {/* Header */}
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 30,
            backdropFilter: "saturate(180%) blur(6px)",
            borderBottom: "1px solid #e5e7eb",
            background: "rgba(255,255,255,0.78)",
          }}
        >
          <div
            style={{
              maxWidth: 1024,
              margin: "0 auto",
              padding: isMobile ? "10px 12px" : "12px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <div
                style={{
                  width: isMobile ? 22 : 24,
                  height: isMobile ? 22 : 24,
                  borderRadius: 6,
                  background: "#111827",
                  color: "#fff",
                  display: "grid",
                  placeItems: "center",
                  fontSize: isMobile ? 12 : 14,
                  flex: "0 0 auto",
                }}
              >
                G
              </div>
              <h1
                style={{
                  fontSize: isMobile ? 16 : 18,
                  margin: 0,
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={COMPANY_FULL}
              >
                {headerTitle}
              </h1>
            </div>

            {/* Header actions: Create Invoice + Auth */}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Link to="/invoices/new">
                <Button>Vytvoriť faktúru</Button>
              </Link>
              {user ? (
                <>
                  <span style={{ fontSize: 12, color: "#374151" }}>{user.email}</span>
                  <Button variant="outline" onClick={() => signOutFirebase()}>
                    Odhlásiť
                  </Button>
                </>
              ) : (
                <Link to="/login">
                  <Button variant="outline">Prihlásiť</Button>
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Main */}
        <div style={{ maxWidth: 1024, margin: "0 auto", padding: isMobile ? 12 : 16 }}>
          {/* Summary */}
          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0,1fr))",
            }}
          >
            <Card style={{ borderLeft: "8px solid #3b82f6" }}>
              <CardHeader>
                <CardTitle style={{ color: "#1d4ed8" }}>Príjmy</CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ fontSize: isMobile ? 26 : 32, fontWeight: 800, color: "#1d4ed8" }}>{eur(totals.inc)}</div>
              </CardContent>
            </Card>
            <Card style={{ borderLeft: "8px solid #ef4444" }}>
              <CardHeader>
                <CardTitle style={{ color: "#b91c1c" }}>Výdavky</CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ fontSize: isMobile ? 26 : 32, fontWeight: 800, color: "#b91c1c" }}>{eur(totals.exp)}</div>
              </CardContent>
            </Card>
            <Card style={{ borderLeft: "8px solid #22c55e" }}>
              <CardHeader>
                <CardTitle style={{ color: "#15803d" }}>Zisk</CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ fontSize: isMobile ? 28 : 36, fontWeight: 900, color: "#15803d" }}>
                  {eur(totals.profit)}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Zisk po zdanení */}
          <Card style={{ borderLeft: "8px solid #16a34a", marginTop: 12 }}>
            <CardHeader>
              <CardTitle style={{ color: "#166534" }}>Zisk po zdanení</CardTitle>
            </CardHeader>
            <CardContent>
              <div style={{ fontSize: isMobile ? 22 : 28, fontWeight: 800, color: "#166534" }}>
                {eur(taxCalc.afterTax)}
              </div>
              <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>
                náklad konateľa {eur(EXEC_EMP_COST)}; CIT {Math.round(taxCalc.rate * 100)}% podľa ročného obratu
              </div>
            </CardContent>
          </Card>

          {/* Dane a odvody */}
          <Card style={{ borderLeft: "8px solid #f59e0b", marginTop: 12 }}>
            <CardHeader>
              <CardTitle style={{ color: "#92400e" }}>Dane a odvody (mesačne)</CardTitle>
            </CardHeader>
            <CardContent>
              <div style={{ display: "grid", gap: 6 }}>
                <RowKV k="Daň z príjmov (CIT)" v={eur(taxCalc.citTax)} />
                <RowKV k="Odvody zamestnávateľa k odmene" v={eur(taxCalc.employerLevies)} />
                <div style={{ height: 1, background: "#e5e7eb", margin: "6px 0" }} />
                <RowKV k="Spolu dane + odvody" v={eur(taxCalc.citTax + taxCalc.employerLevies)} danger />
              </div>
            </CardContent>
          </Card>

          {/* Filtre */}
          <Card style={{ marginTop: 12, marginBottom: 12 }}>
            <CardContent>
              <div
                style={{
                  display: "grid",
                  gap: 12,
                  gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0,1fr))",
                }}
              >
                <div>
                  <Label>Mesiac</Label>
                  <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <Label>Hľadať</Label>
                  <input
                    placeholder="firma, číslo dokladu…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "auto auto", gap: 8, alignItems: "end" }}>
                  <Button variant="outline" block={isMobile}>
                    Filter
                  </Button>
                  <Button variant="outline" onClick={() => window.print()} block={isMobile}>
                    Tlač
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Prepínač */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "auto auto", gap: 8 }}>
            <Button variant={tab === "prijem" ? "solid" : "outline"} onClick={() => setTab("prijem")} block={isMobile}>
              Príjmy
            </Button>
            <Button variant={tab === "vydavok" ? "solid" : "outline"} onClick={() => setTab("vydavok")} block={isMobile}>
              Výdavky
            </Button>
          </div>

          {/* Formulár */}
          <Card style={{ marginTop: 12 }}>
            <CardHeader>
              <CardTitle>{tab === "prijem" ? "Nový príjem" : "Nový výdavok"}</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                style={{
                  display: "grid",
                  gap: 12,
                  gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0,1fr))",
                }}
              >
                <div>
                  <Label>Dátum</Label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <Label>Číslo faktúry</Label>
                  <input
                    placeholder="F2025-001"
                    value={form.docNumber}
                    onChange={(e) => setForm((p) => ({ ...p, docNumber: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
                {tab === "prijem" && (
                  <div>
                    <Label>Meno firmy</Label>
                    <input
                      placeholder="Odberateľ"
                      value={form.company || ""}
                      onChange={(e) => setForm((p) => ({ ...p, company: e.target.value }))}
                      style={inputStyle}
                    />
                  </div>
                )}
                <div>
                  <Label>Suma</Label>
                  <input
                    inputMode="decimal"
                    placeholder="0,00"
                    value={form.amount}
                    onChange={(e) => setForm((p) => ({ ...p, amount: parseNum(e.target.value) }))}
                    style={inputStyle}
                  />
                </div>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr 1fr" : "auto auto",
                  justifyContent: "flex-end",
                  gap: 8,
                  marginTop: 16,
                }}
              >
                <Button onClick={() => upsertEntry(tab)} block={isMobile}>
                  Uložiť
                </Button>
                <Button variant="outline" onClick={() => resetForm(tab)} block={isMobile}>
                  Vyčistiť
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Záznamy */}
          <Card style={{ marginTop: 12 }}>
            <CardHeader>
              <CardTitle>Záznamy</CardTitle>
            </CardHeader>
            <CardContent>
              {isMobile ? (
                <div style={{ display: "grid", gap: 8 }}>
                  {filtered.map((e) => (
                    <div
                      key={e.id}
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 10,
                        padding: 12,
                        display: "grid",
                        gap: 6,
                        background: "#fff",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ fontWeight: 600 }}>{e.docNumber}</span>
                        <span
                          style={{
                            fontSize: 12,
                            padding: "2px 8px",
                            borderRadius: 999,
                            background: e.type === "prijem" ? "#e0f2fe" : "#fee2e2",
                            color: e.type === "prijem" ? "#075985" : "#991b1b",
                          }}
                        >
                          {e.type}
                        </span>
                      </div>
                      <div style={{ color: "#374151" }}>{e.company}</div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "#6b7280" }}>{e.date}</span>
                        <strong style={{ fontVariantNumeric: "tabular-nums" }}>{eur(e.amount)}</strong>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 6 }}>
                        <Button variant="outline" onClick={() => editEntry(e)}>
                          Upraviť
                        </Button>
                        <Button variant="danger" onClick={() => removeEntry(e.id)}>
                          Zmazať
                        </Button>
                      </div>
                    </div>
                  ))}
                  {filtered.length === 0 && (
                    <div style={{ textAlign: "center", padding: 16, color: "#6b7280" }}>Žiadne záznamy v tomto mesiaci.</div>
                  )}
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
                    <thead>
                      <tr>
                        <th style={thHeader}>Dátum</th>
                        <th style={thHeader}>Č. dokladu</th>
                        <th style={thHeader}>Firma</th>
                        <th style={{ ...thHeader, textAlign: "right" }}>Suma</th>
                        <th style={thHeader}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((e) => (
                        <tr key={e.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                          <td style={tdCell}>{e.date}</td>
                          <td style={tdCell}>{e.docNumber}</td>
                          <td style={tdCell}>{e.company}</td>
                          <td style={{ ...tdCell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{eur(e.amount)}</td>
                          <td style={tdCell}>
                            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                              <Button variant="outline" onClick={() => editEntry(e)}>
                                Upraviť
                              </Button>
                              <Button variant="danger" onClick={() => removeEntry(e.id)}>
                                Zmazať
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filtered.length === 0 && (
                        <tr>
                          <td colSpan={5} style={{ ...tdCell, textAlign: "center", padding: 24, color: "#6b7280" }}>
                            Žiadne záznamy v tomto mesiaci.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Footer */}
          <div style={{ fontSize: 12, color: "#6b7280", padding: 16, textAlign: "left" }}>
            © {new Date().getFullYear()} {COMPANY_FULL}. Dáta sa synchronizujú s Firebase Firestore. Pri výpadku sa ukladajú lokálne.
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================
// Small presentational helpers
// ==========================
function RowKV({ k, v, danger }: { k: string; v: string; danger?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", color: danger ? "#b91c1c" : undefined }}>
      <span>{k}</span>
      <strong>{v}</strong>
    </div>
  );
}
function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ display: "block", fontSize: 12, color: "#374151", marginBottom: 6 }}>{children}</label>;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 10,
  borderRadius: 10,
  border: "1px solid #d1d5db",
  fontSize: 14,
};

const thHeader: React.CSSProperties = {
  textAlign: "left",
  fontSize: 12,
  color: "#374151",
  padding: "10px 12px",
  borderBottom: "1px solid #e5e7eb",
};
const tdCell: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #f3f4f6",
  whiteSpace: "nowrap",
};

