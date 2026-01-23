// src/lib/templateEngine.ts
// Template Engine for automatic transaction creation from documents

import { db } from "@/firebase";
import { collection, doc, getDocs, setDoc, getDoc, Timestamp } from "firebase/firestore";
import type { Transaction, TransactionLine, Account } from "./accountingSchemas";

function getCompanyId(): string {
  const stored = localStorage.getItem("gpcs-company-id");
  return stored || "gpcs";
}

// ============================================================================
// EXTENDED TEMPLATE TYPES
// ============================================================================

export type TemplateAppliesTo = 
  | "INVOICE_ISSUED" 
  | "INVOICE_RECEIVED" 
  | "BANK_RECEIPT" 
  | "BANK_PAYMENT" 
  | "PAYROLL"
  | "MANUAL";

export interface ExtendedTemplateLine {
  id: string;
  side: "MD" | "D";
  accountCode: string;
  accountName?: string;
  amountSource: "TOTAL" | "CUSTOM" | "PERCENT";
  amountValue?: number; // For CUSTOM or PERCENT
  partnerSide?: "SUPPLIER" | "CUSTOMER" | null;
  description?: string;
}

export interface ExtendedTemplate {
  id: string;
  code: string;
  name: string;
  description: string;
  appliesTo: TemplateAppliesTo[];
  lines: ExtendedTemplateLine[];
  categoryDefault?: string;
  enabled: boolean;
  isSystem: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy?: string;
}

// ============================================================================
// DEFAULT TEMPLATES
// ============================================================================

export const SYSTEM_TEMPLATES: Omit<ExtendedTemplate, "id" | "createdAt" | "updatedAt">[] = [
  {
    code: "FA_VYDANA_SLUZBY",
    name: "Vystavená FA (služby)",
    description: "Účtovanie vystavenej faktúry za služby",
    appliesTo: ["INVOICE_ISSUED"],
    lines: [
      { id: "1", side: "MD", accountCode: "311", amountSource: "TOTAL", partnerSide: "CUSTOMER", description: "Pohľadávka" },
      { id: "2", side: "D", accountCode: "602", amountSource: "TOTAL", description: "Tržby za služby" },
    ],
    categoryDefault: "Služby",
    enabled: true,
    isSystem: true,
  },
  {
    code: "UHRADA_ODBERATEL",
    name: "Úhrada od odberateľa",
    description: "Príjem platby od odberateľa na bankový účet",
    appliesTo: ["BANK_RECEIPT"],
    lines: [
      { id: "1", side: "MD", accountCode: "221", amountSource: "TOTAL", description: "Príjem na účet" },
      { id: "2", side: "D", accountCode: "311", amountSource: "TOTAL", partnerSide: "CUSTOMER", description: "Zúčtovanie pohľadávky" },
    ],
    enabled: true,
    isSystem: true,
  },
  {
    code: "FA_PRIJATA_SLUZBY",
    name: "Prijatá FA (služby)",
    description: "Účtovanie prijatej faktúry za služby (vrátane nájmu auta)",
    appliesTo: ["INVOICE_RECEIVED"],
    lines: [
      { id: "1", side: "MD", accountCode: "518", amountSource: "TOTAL", description: "Náklady na služby" },
      { id: "2", side: "D", accountCode: "321", amountSource: "TOTAL", partnerSide: "SUPPLIER", description: "Záväzok" },
    ],
    categoryDefault: "Služby",
    enabled: true,
    isSystem: true,
  },
  {
    code: "UHRADA_DODAVATEL",
    name: "Úhrada dodávateľovi",
    description: "Platba dodávateľovi z bankového účtu",
    appliesTo: ["BANK_PAYMENT"],
    lines: [
      { id: "1", side: "MD", accountCode: "321", amountSource: "TOTAL", partnerSide: "SUPPLIER", description: "Zúčtovanie záväzku" },
      { id: "2", side: "D", accountCode: "221", amountSource: "TOTAL", description: "Výdaj z účtu" },
    ],
    enabled: true,
    isSystem: true,
  },
  {
    code: "NAJOM_AUTA",
    name: "Nájom auta (služba)",
    description: "Účtovanie nájomného za auto prenajaté od FO",
    appliesTo: ["INVOICE_RECEIVED", "MANUAL"],
    lines: [
      { id: "1", side: "MD", accountCode: "518", amountSource: "TOTAL", description: "Nájomné - auto" },
      { id: "2", side: "D", accountCode: "321", amountSource: "TOTAL", partnerSide: "SUPPLIER", description: "Záväzok voči prenajímateľovi" },
    ],
    categoryDefault: "Nájom",
    enabled: true,
    isSystem: true,
  },
  {
    code: "MZDA_NAKLAD",
    name: "Mzda - náklad",
    description: "Zaúčtovanie mzdového nákladu a odvodov",
    appliesTo: ["PAYROLL"],
    lines: [
      { id: "1", side: "MD", accountCode: "521", amountSource: "CUSTOM", description: "Hrubá mzda" },
      { id: "2", side: "MD", accountCode: "524", amountSource: "CUSTOM", description: "Odvody zamestnávateľa" },
      { id: "3", side: "D", accountCode: "331", amountSource: "CUSTOM", description: "Záväzok voči zamestnancovi (netto)" },
      { id: "4", side: "D", accountCode: "336", amountSource: "CUSTOM", description: "Záväzok SP+ZP" },
      { id: "5", side: "D", accountCode: "342", amountSource: "CUSTOM", description: "Záväzok preddavok daň" },
    ],
    enabled: true,
    isSystem: true,
  },
  {
    code: "VYPLATA_MZDY",
    name: "Výplata mzdy",
    description: "Úhrada čistej mzdy zamestnancovi",
    appliesTo: ["PAYROLL", "BANK_PAYMENT"],
    lines: [
      { id: "1", side: "MD", accountCode: "331", amountSource: "TOTAL", description: "Zúčtovanie záväzku" },
      { id: "2", side: "D", accountCode: "221", amountSource: "TOTAL", description: "Výdaj z účtu" },
    ],
    enabled: true,
    isSystem: true,
  },
  {
    code: "UHRADA_ODVODY",
    name: "Úhrada odvodov SP+ZP",
    description: "Úhrada odvodov sociálnej a zdravotnej poisťovni",
    appliesTo: ["PAYROLL", "BANK_PAYMENT"],
    lines: [
      { id: "1", side: "MD", accountCode: "336", amountSource: "TOTAL", description: "Zúčtovanie záväzku SP+ZP" },
      { id: "2", side: "D", accountCode: "221", amountSource: "TOTAL", description: "Výdaj z účtu" },
    ],
    enabled: true,
    isSystem: true,
  },
  {
    code: "UHRADA_DAN",
    name: "Úhrada preddavku dane",
    description: "Úhrada preddavku na daň z príjmov",
    appliesTo: ["PAYROLL", "BANK_PAYMENT"],
    lines: [
      { id: "1", side: "MD", accountCode: "342", amountSource: "TOTAL", description: "Zúčtovanie záväzku daň" },
      { id: "2", side: "D", accountCode: "221", amountSource: "TOTAL", description: "Výdaj z účtu" },
    ],
    enabled: true,
    isSystem: true,
  },
];

// ============================================================================
// TEMPLATE SERVICE FUNCTIONS
// ============================================================================

export async function getTemplates(): Promise<ExtendedTemplate[]> {
  const companyId = getCompanyId();
  const templatesRef = collection(db, "companies", companyId, "templates");
  const snap = await getDocs(templatesRef);
  
  if (snap.empty) {
    // Initialize with system templates
    await initializeTemplates();
    return getTemplates();
  }
  
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ExtendedTemplate));
}

export async function initializeTemplates(): Promise<void> {
  const companyId = getCompanyId();
  const templatesRef = collection(db, "companies", companyId, "templates");
  const now = Timestamp.now();
  
  for (const template of SYSTEM_TEMPLATES) {
    const newRef = doc(templatesRef, template.code);
    await setDoc(newRef, {
      ...template,
      id: template.code,
      createdAt: now,
      updatedAt: now,
    });
  }
}

export async function getTemplate(templateId: string): Promise<ExtendedTemplate | null> {
  const companyId = getCompanyId();
  const ref = doc(db, "companies", companyId, "templates", templateId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as ExtendedTemplate;
}

export async function saveTemplate(template: Partial<ExtendedTemplate> & { id?: string }): Promise<string> {
  const companyId = getCompanyId();
  const templatesRef = collection(db, "companies", companyId, "templates");
  const now = Timestamp.now();
  
  if (template.id) {
    const ref = doc(templatesRef, template.id);
    await setDoc(ref, {
      ...template,
      updatedAt: now,
    }, { merge: true });
    return template.id;
  } else {
    const newRef = doc(templatesRef);
    await setDoc(newRef, {
      ...template,
      id: newRef.id,
      createdAt: now,
      updatedAt: now,
    });
    return newRef.id;
  }
}

// ============================================================================
// TEMPLATE ENGINE - APPLY TEMPLATE TO CREATE TRANSACTION
// ============================================================================

export interface ApplyTemplateInput {
  template: ExtendedTemplate;
  amount: number;
  date: Date;
  description: string;
  partnerId?: string;
  partnerName?: string;
  documentId?: string;
  documentType?: string;
  customAmounts?: Record<string, number>; // lineId -> amount for CUSTOM lines
}

export interface TransactionDraft {
  date: Timestamp;
  description: string;
  lines: TransactionLine[];
  totalMd: number;
  totalD: number;
  documentId?: string;
  documentType?: string;
  templateId: string;
  isBalanced: boolean;
}

export function applyTemplate(input: ApplyTemplateInput): TransactionDraft {
  const { template, amount, date, description, partnerId, partnerName, documentId, documentType, customAmounts } = input;
  
  const lines: TransactionLine[] = template.lines.map((line, index) => {
    let lineAmount = amount;
    
    if (line.amountSource === "CUSTOM" && customAmounts && customAmounts[line.id]) {
      lineAmount = customAmounts[line.id];
    } else if (line.amountSource === "PERCENT" && line.amountValue) {
      lineAmount = amount * (line.amountValue / 100);
    }
    
    // Round to 2 decimal places
    lineAmount = Math.round(lineAmount * 100) / 100;
    
    return {
      id: `line-${index + 1}`,
      accountCode: line.accountCode,
      accountName: line.accountName || line.accountCode,
      side: line.side as "MD" | "D",
      amount: lineAmount,
      description: line.description,
      partnerId: line.partnerSide ? partnerId : undefined,
      partnerName: line.partnerSide ? partnerName : undefined,
    };
  });
  
  const totalMd = lines.filter((l) => l.side === "MD").reduce((sum, l) => sum + l.amount, 0);
  const totalD = lines.filter((l) => l.side === "D").reduce((sum, l) => sum + l.amount, 0);
  
  return {
    date: Timestamp.fromDate(date),
    description,
    lines,
    totalMd: Math.round(totalMd * 100) / 100,
    totalD: Math.round(totalD * 100) / 100,
    documentId,
    documentType,
    templateId: template.id,
    isBalanced: Math.abs(totalMd - totalD) < 0.01,
  };
}

// ============================================================================
// CREATE TRANSACTION FROM TEMPLATE
// ============================================================================

export async function createTransactionFromTemplate(
  input: ApplyTemplateInput,
  userId: string,
  status: "DRAFT" | "POSTED" = "DRAFT"
): Promise<string> {
  const draft = applyTemplate(input);
  
  if (!draft.isBalanced) {
    throw new Error(`Transakcia nie je vyvážená: MD=${draft.totalMd}, D=${draft.totalD}`);
  }
  
  const companyId = getCompanyId();
  const transactionsRef = collection(db, "companies", companyId, "transactions");
  const now = Timestamp.now();
  
  // Generate transaction number
  const snap = await getDocs(transactionsRef);
  const period = input.date.toISOString().slice(0, 7);
  const nextNum = snap.size + 1;
  const number = `TRN-${period.replace("-", "")}-${String(nextNum).padStart(4, "0")}`;
  
  const newRef = doc(transactionsRef);
  const transaction: Omit<Transaction, "id"> & { id: string } = {
    id: newRef.id,
    number,
    date: draft.date,
    description: draft.description,
    lines: draft.lines,
    totalMd: draft.totalMd,
    totalD: draft.totalD,
    status,
    documentId: draft.documentId,
    documentType: draft.documentType as any,
    templateId: draft.templateId,
    period,
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
    ...(status === "POSTED" ? { postedAt: now, postedBy: userId } : {}),
  };
  
  await setDoc(newRef, transaction);
  return newRef.id;
}

// ============================================================================
// GET TEMPLATES FOR DOCUMENT TYPE
// ============================================================================

export async function getTemplatesForType(type: TemplateAppliesTo): Promise<ExtendedTemplate[]> {
  const templates = await getTemplates();
  return templates.filter((t) => t.enabled && t.appliesTo.includes(type));
}

// ============================================================================
// LOAD ACCOUNT NAMES INTO TEMPLATE LINES
// ============================================================================

export async function enrichTemplateWithAccountNames(template: ExtendedTemplate): Promise<ExtendedTemplate> {
  const companyId = getCompanyId();
  const accountsRef = collection(db, "companies", companyId, "chartOfAccounts");
  const snap = await getDocs(accountsRef);
  const accounts = new Map<string, string>();
  snap.docs.forEach((d) => {
    const acc = d.data() as Account;
    accounts.set(acc.code, acc.name);
  });
  
  return {
    ...template,
    lines: template.lines.map((line) => ({
      ...line,
      accountName: accounts.get(line.accountCode) || line.accountCode,
    })),
  };
}
