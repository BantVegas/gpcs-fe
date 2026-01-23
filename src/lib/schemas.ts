// src/lib/schemas.ts
// Firestore data model for GPCS Ucto - Professional Accounting Software

import type { Timestamp } from "firebase/firestore";

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

export type EntryType = "INCOME" | "EXPENSE";
export type PaymentStatus = "PAID" | "UNPAID" | "PARTIAL";
export type PaymentMethodType = "BANK_TRANSFER" | "CASH" | "CARD" | "OTHER";
export type EntrySource = "MANUAL" | "UPLOAD_IMPORT" | "INVOICE_ISSUED" | "INVOICE_RECEIVED";
export type PartnerSource = "ICO_LOOKUP" | "MANUAL";
export type UploadStatus = "UPLOADED" | "PROCESSING" | "EXTRACTED" | "NEEDS_REVIEW" | "ACCOUNTED" | "ERROR";
export type CorporateTaxMode = "FIXED" | "AUTO_BRACKETS";
export type CurrencyType = "EUR" | "USD" | "CZK" | "GBP" | "PLN" | "HUF" | "CHF";
export type DirectionHint = "INCOME" | "EXPENSE" | "UNKNOWN";

export const CATEGORIES = {
  INCOME: [
    "Tržby za služby",
    "Tržby za tovar",
    "Predaj majetku",
    "Úroky",
    "Iné príjmy",
  ],
  EXPENSE: [
    "Materiál a tovar",
    "Služby",
    "Nájom",
    "Energie",
    "Telefón a internet",
    "Poistenie",
    "Doprava a PHM",
    "Opravy a údržba",
    "Mzdy a odvody",
    "Dane a poplatky",
    "Bankové poplatky",
    "Reprezentácia",
    "Kancelárske potreby",
    "Software a licencie",
    "Marketing a reklama",
    "Odpisy",
    "Iné výdavky",
  ],
} as const;

// ============================================================================
// PARTNER
// ============================================================================

export interface PartnerSnapshot {
  name: string;
  ico?: string;
  dic?: string;
  address?: string;
  iban?: string;
}

export interface Partner {
  id: string;
  name: string;
  ico?: string;
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
  source: PartnerSource;
  lastVerifiedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ============================================================================
// ENTRY (Income/Expense)
// ============================================================================

export interface EntryPayment {
  status: PaymentStatus;
  method?: PaymentMethodType;
  paidAt?: Timestamp;
  vs?: string;
  iban?: string;
}

export interface EntryDeductible {
  enabled: boolean;
  percent: number;
}

export interface EntryAttachment {
  storagePath: string;
  fileName: string;
  mime: string;
  size: number;
}

export interface Entry {
  id: string;
  type: EntryType;
  date: Timestamp;
  amount: number;
  currency: CurrencyType;
  amountEur?: number; // Converted amount in EUR for reporting
  partnerId?: string;
  partnerSnapshot?: PartnerSnapshot;
  category: string;
  description: string;
  docNumber?: string;
  payment: EntryPayment;
  deductible: EntryDeductible;
  attachments: EntryAttachment[];
  source: EntrySource;
  sourceDocId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}

// ============================================================================
// INVOICE (Issued & Received)
// ============================================================================

export interface InvoiceLineItem {
  id: string;
  name: string;
  qty: number;
  unit: string;
  unitPrice: number;
  total: number;
}

export interface InvoiceIssued {
  id: string;
  number: string;
  issueDate: Timestamp;
  dueDate: Timestamp;
  supplier: PartnerSnapshot;
  customer: PartnerSnapshot;
  customerId?: string;
  currency: "EUR";
  items: InvoiceLineItem[];
  subtotal: number;
  total: number;
  note?: string;
  payment: {
    status: PaymentStatus;
    method?: PaymentMethodType;
    iban?: string;
    vs?: string;
    paidAt?: Timestamp;
  };
  entryId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}

export interface InvoiceReceived {
  id: string;
  number?: string;
  issueDate: Timestamp;
  dueDate?: Timestamp;
  receivedDate: Timestamp;
  supplier: PartnerSnapshot;
  supplierId?: string;
  currency: "EUR";
  items?: InvoiceLineItem[];
  subtotal?: number;
  total: number;
  note?: string;
  payment: {
    status: PaymentStatus;
    method?: PaymentMethodType;
    iban?: string;
    vs?: string;
    paidAt?: Timestamp;
  };
  uploadId?: string;
  entryId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}

// ============================================================================
// UPLOAD (Document upload & extraction)
// ============================================================================

export interface ExtractedData {
  directionHint: DirectionHint;
  supplier?: {
    name?: string;
    ico?: string;
    dic?: string;
    address?: string;
    iban?: string;
  };
  customer?: {
    name?: string;
    ico?: string;
    dic?: string;
    address?: string;
  };
  docNumber?: string;
  variableSymbol?: string;
  issueDate?: string;
  dueDate?: string;
  totalAmount?: number;
  currency?: string;
  bankIban?: string;
  notes?: string;
  lineItems?: {
    name?: string;
    qty?: number;
    unit?: string;
    unitPrice?: number;
    total?: number;
  }[];
  confidence: {
    overall: number;
    amount?: number;
    date?: number;
    supplier?: number;
  };
  rawText?: string;
}

export interface Upload {
  id: string;
  fileName: string;
  storagePath: string;
  downloadUrl?: string;
  mime: string;
  size: number;
  status: UploadStatus;
  extractedData?: ExtractedData;
  error?: string;
  entryId?: string;
  invoiceId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}

// ============================================================================
// SETTINGS
// ============================================================================

export interface TaxBracket {
  upToRevenue: number | null;
  rate: number;
}

export interface TaxSettings {
  year: number;
  corporateTaxMode: CorporateTaxMode;
  corporateTaxFixedRate: number;
  corporateBrackets: TaxBracket[];
  dividendWithholdingRate: number;
  applyMinimalTax: boolean;
  lossCarryforward: number;
}

export interface CompanySettings {
  companyName: string;
  ico: string;
  dic: string;
  street: string;
  city: string;
  zip: string;
  country: string;
  phone?: string;
  email?: string;
  iban?: string;
  tax: TaxSettings;
}

// ============================================================================
// DEFAULT VALUES
// ============================================================================

export const DEFAULT_TAX_SETTINGS: TaxSettings = {
  year: 2026,
  corporateTaxMode: "FIXED",
  corporateTaxFixedRate: 0.10,
  corporateBrackets: [
    { upToRevenue: 100000, rate: 0.10 },
    { upToRevenue: 5000000, rate: 0.21 },
    { upToRevenue: null, rate: 0.24 },
  ],
  dividendWithholdingRate: 0.07,
  applyMinimalTax: false,
  lossCarryforward: 0,
};

export const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
  companyName: "GPCS s.r.o.",
  ico: "57150061",
  dic: "2123456789",
  street: "Doležalova 15C",
  city: "Bratislava",
  zip: "821 04",
  country: "Slovensko",
  phone: "+421950889523",
  email: "info@gpcs.sk",
  iban: "SK6911000000002944275764",
  tax: DEFAULT_TAX_SETTINGS,
};

// ============================================================================
// HELPER TYPES FOR FORMS
// ============================================================================

export interface EntryFormData {
  type: EntryType;
  date: string;
  amount: string;
  category: string;
  description: string;
  docNumber: string;
  partnerId: string;
  partnerName: string;
  partnerIco: string;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethodType;
  vs: string;
  iban: string;
  deductibleEnabled: boolean;
  deductiblePercent: string;
}

export interface PartnerFormData {
  name: string;
  ico: string;
  dic: string;
  icdph: string;
  street: string;
  city: string;
  zip: string;
  country: string;
  phone: string;
  email: string;
  iban: string;
}
