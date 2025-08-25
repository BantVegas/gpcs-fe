// src/lib/types.ts
export type Unit =
  | "ks" | "hod" | "kg" | "l" | "bal" | "sada" | "mesačne" | "paušál";

export type PaymentMethod =
  | "Prevodom"
  | "Hotovosť"
  | "Platobná karta"
  | "Dobierka"
  | "Iné";

export interface Company {
  ico: string;
  name: string;
  dic?: string;
  icdph?: string;
  street?: string;
  city?: string;
  zip?: string;
  country?: string;
  address?: string;
  phone?: string;
  email?: string;
  iban?: string;
}

export interface InvoiceItem {
  id: string;
  name: string;
  qty: number;
  unit: Unit;
  unitPrice: number;
  vatRate?: number; // %; pre neplatiteľa 0 alebo undefined
}

export interface InvoiceTotals {
  base: number;
  vat: number;
  gross: number;
}

export interface InvoicePayment {
  iban?: string;
  method: PaymentMethod;
  variableSymbol?: string;
}

export interface Invoice {
  id: string;
  number: string;
  issueDate: string;
  dueDate: string;
  supplier: Company;
  customer: Company;
  currency: "EUR";
  items: InvoiceItem[];
  note?: string;
  logoUrl?: string;
  vatPayer: boolean;
  totals: InvoiceTotals;
  payment?: InvoicePayment;
  createdBy: string;
  createdAt: number;
}
