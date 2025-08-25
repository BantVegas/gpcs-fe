// src/pages/InvoicePreview.tsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebase";
import type { Invoice } from "@/lib/types";

const eur = (n: number) => new Intl.NumberFormat("sk-SK", { style: "currency", currency: "EUR" }).format(n);

export default function InvoicePreview() {
  const { id } = useParams();
  const [inv, setInv] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!id) return;
      const snap = await getDoc(doc(db, "invoices", id));
      setInv(snap.exists() ? (snap.data() as Invoice) : null);
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <div style={{ padding: 16 }}>Načítavam…</div>;
  if (!inv) return <div style={{ padding: 16 }}>Faktúra nenájdená.</div>;

  // --- SAFE hodnoty pre platbu (inv.payment je voliteľné) ---
  const payIban = inv.payment?.iban || inv.supplier.iban || "-";
  const payMethod = inv.payment?.method || "prevodom";
  const payVS = inv.payment?.variableSymbol || inv.number;

  return (
    <div style={{ maxWidth: 1024, margin: "0 auto", padding: 16, background: "#fff" }}>
      {/* HLAVIČKA */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 24, alignItems: "start" }}>
        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 16, alignItems: "center" }}>
          <img
            src={inv.logoUrl || "/images/gpcs.png"}
            alt="logo"
            style={{
              width: 160, height: 160, objectFit: "contain",
              background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, boxShadow: "0 1px 2px rgba(0,0,0,.06)",
            }}
          />
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.25, marginBottom: 6 }}>
              {inv.supplier.name}
            </div>
            <div style={{ color: "#374151" }}>
              {inv.supplier.street}, {inv.supplier.zip} {inv.supplier.city}<br />
              IČO: {inv.supplier.ico}&nbsp;&nbsp; DIČ: {inv.supplier.dic || "-"}<br />
              {inv.vatPayer ? null : <strong>Neplatiteľ DPH</strong>}<br />
              {inv.supplier.phone ? <>Tel.: {inv.supplier.phone}<br /></> : null}
              {inv.supplier.email ? <>E-mail: {inv.supplier.email}</> : null}
            </div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: 1 }}>FAKTÚRA č. {inv.number}</div>
        </div>
      </div>

      {/* Dodávateľ / Odberateľ */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
        <Box title="DODÁVATEĽ">
          <strong>{inv.supplier.name}</strong><br />
          {inv.supplier.street}<br />
          {inv.supplier.zip} {inv.supplier.city}<br />
          IČO {inv.supplier.ico}&nbsp;&nbsp; DIČ {inv.supplier.dic || "-"}<br />
          {inv.vatPayer ? null : <>Neplatiteľ DPH</>}
          {inv.supplier.phone || inv.supplier.email ? (
            <>
              <br />
              <div>Kontaktné údaje</div>
              {inv.supplier.phone ? <>{inv.supplier.phone}&nbsp;</> : null}
              {inv.supplier.email ?? null}
            </>
          ) : null}
        </Box>

        <Box title="ODBERATEĽ">
          <strong>{inv.customer.name || "-"}</strong><br />
          {inv.customer.street || "-"}<br />
          {(inv.customer.zip || "")} {(inv.customer.city || "")}<br />
          IČO {inv.customer.ico || "-"}&nbsp;&nbsp; DIČ {inv.customer.dic || "-"}
        </Box>
      </div>

      {/* Platobné údaje */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, marginTop: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", padding: 12, gap: 12 }}>
          <KV k="IBAN" v={payIban} />
          <KV k="Forma úhrady" v={payMethod} />
          <KV k="Variabilný symbol" v={payVS} />
          <KV k="Dátum vystavenia" v={inv.issueDate} />
          <KV k="Dátum splatnosti" v={inv.dueDate} />
        </div>
      </div>

      {/* Položky */}
      <div style={{ marginTop: 16, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr>
              <Th>Počet</Th>
              <Th>Popis</Th>
              {inv.vatPayer && <Th>DPH %</Th>}
              <Th>Jedn. cena</Th>
              <Th>Celkom</Th>
            </tr>
          </thead>
          <tbody>
            {inv.items.map((it, i) => {
              const base = it.qty * it.unitPrice;
              const vat = inv.vatPayer ? base * ((it.vatRate ?? 0) / 100) : 0;
              const total = base + vat;
              return (
                <tr key={it.id}>
                  <Td>{it.qty} {it.unit}</Td>
                  <Td>{i + 1}. {it.name}</Td>
                  {inv.vatPayer && <Td>{it.vatRate ?? 0}%</Td>}
                  <Td style={{ textAlign: "right" }}>{eur(it.unitPrice)}</Td>
                  <Td style={{ textAlign: "right" }}>{eur(total)}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Súhrn */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", marginTop: 16 }}>
        <div />
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>
            Celkom k úhrade: {eur(inv.totals.gross)}
          </div>
          {inv.vatPayer ? (
            <>
              <div>Základ: <strong>{eur(inv.totals.base)}</strong></div>
              <div>DPH: <strong>{eur(inv.totals.vat)}</strong></div>
            </>
          ) : (
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>Nie som platiteľ DPH.</div>
          )}
        </div>
      </div>

      {inv.note && <div style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{inv.note}</div>}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
        <button
          onClick={() => window.print()}
          style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #d1d5db", background: "transparent", cursor: "pointer" }}
        >
          Tlačiť
        </button>
      </div>
    </div>
  );
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{title}</div>
      <div>{children}</div>
    </div>
  );
}
function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{ textAlign: "left", fontSize: 12, color: "#374151", padding: "10px 12px", borderBottom: "1px solid #e5e7eb" }}>
      {children}
    </th>
  );
}
function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6", whiteSpace: "nowrap", ...style }}>
      {children}
    </td>
  );
}
function KV({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "#6b7280" }}>{k}</div>
      <div style={{ fontWeight: 600 }}>{v}</div>
    </div>
  );
}

