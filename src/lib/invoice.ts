// src/lib/invoice.ts
import type { InvoiceItem, InvoiceTotals } from "./types";

export function computeTotals(items: InvoiceItem[], vatPayer: boolean): InvoiceTotals {
  let base = 0;
  let vat = 0;

  for (const it of items) {
    const line = (it.qty || 0) * (it.unitPrice || 0);
    base += line;
    if (vatPayer) {
      vat += ((it.vatRate ?? 0) / 100) * line;
    }
  }

  return { base, vat, gross: base + vat };
}
