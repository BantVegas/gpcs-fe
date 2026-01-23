// src/lib/accountingSchemas.ts
// Firestore data model for GPCS Účto - Double-Entry Accounting System

import type { Timestamp } from "firebase/firestore";

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

export type TransactionStatus = "DRAFT" | "POSTED" | "LOCKED";
export type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
export type AccountSide = "MD" | "D"; // MD = Má dať (Debit), D = Dal (Credit)
export type TaskStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED";
export type TaskSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type TaskCategory = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" | "ONETIME";
export type NotificationType = "TASK_DUE" | "TASK_OVERDUE" | "PERIOD_CLOSING" | "SYSTEM";
export type PeriodStatus = "OPEN" | "CLOSING" | "CLOSED" | "LOCKED";
export type DocumentType = "INVOICE_ISSUED" | "INVOICE_RECEIVED" | "BANK_STATEMENT" | "PAYROLL" | "OTHER";

// ============================================================================
// CHART OF ACCOUNTS (Účtový rozvrh)
// ============================================================================

export interface Account {
  id: string;
  code: string; // e.g., "221", "311", "518"
  name: string;
  type: AccountType;
  normalSide: AccountSide; // Which side increases the account
  parentCode?: string; // For hierarchical structure
  isActive: boolean;
  isSystem: boolean; // System accounts cannot be deleted
  description?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Default chart of accounts for Slovak s.r.o.
export const DEFAULT_ACCOUNTS: Omit<Account, "id" | "createdAt" | "updatedAt">[] = [
  // Assets (Aktíva)
  { code: "221", name: "Bankové účty", type: "ASSET", normalSide: "MD", isActive: true, isSystem: true },
  { code: "311", name: "Pohľadávky z obchodného styku", type: "ASSET", normalSide: "MD", isActive: true, isSystem: true },
  
  // Liabilities (Pasíva)
  { code: "321", name: "Záväzky z obchodného styku", type: "LIABILITY", normalSide: "D", isActive: true, isSystem: true },
  { code: "331", name: "Zamestnanci", type: "LIABILITY", normalSide: "D", isActive: true, isSystem: true },
  { code: "336", name: "Zúčtovanie s orgánmi sociálneho a zdravotného poistenia", type: "LIABILITY", normalSide: "D", isActive: true, isSystem: true },
  { code: "342", name: "Ostatné priame dane", type: "LIABILITY", normalSide: "D", isActive: true, isSystem: true },
  
  // Expenses (Náklady)
  { code: "518", name: "Ostatné služby", type: "EXPENSE", normalSide: "MD", isActive: true, isSystem: true },
  { code: "521", name: "Mzdové náklady", type: "EXPENSE", normalSide: "MD", isActive: true, isSystem: true },
  { code: "524", name: "Zákonné sociálne poistenie", type: "EXPENSE", normalSide: "MD", isActive: true, isSystem: true },
  { code: "591", name: "Daň z príjmov z bežnej činnosti - splatná", type: "EXPENSE", normalSide: "MD", isActive: true, isSystem: true },
  
  // Revenue (Výnosy)
  { code: "602", name: "Tržby z predaja služieb", type: "REVENUE", normalSide: "D", isActive: true, isSystem: true },
];

// ============================================================================
// TRANSACTIONS (Účtovné zápisy)
// ============================================================================

export interface TransactionLine {
  id: string;
  accountCode: string;
  accountName: string;
  side: AccountSide;
  amount: number;
  description?: string;
  partnerId?: string;
  partnerName?: string;
}

export interface Transaction {
  id: string;
  number: string; // Sequential transaction number
  date: Timestamp;
  description: string;
  lines: TransactionLine[];
  totalMd: number; // Sum of MD amounts
  totalD: number; // Sum of D amounts
  status: TransactionStatus;
  documentId?: string; // Link to source document
  documentType?: DocumentType;
  templateId?: string; // If created from template
  period: string; // YYYY-MM format
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
  postedAt?: Timestamp;
  postedBy?: string;
  lockedAt?: Timestamp;
}

// ============================================================================
// ACCOUNTING TEMPLATES (Šablóny účtovania)
// ============================================================================

export interface TemplateLine {
  accountCode: string;
  side: AccountSide;
  amountType: "FULL" | "PERCENT" | "FIXED";
  amountValue?: number; // For PERCENT or FIXED
  description?: string;
}

export interface AccountingTemplate {
  id: string;
  code: string;
  name: string;
  description: string;
  category: "INVOICE" | "PAYMENT" | "PAYROLL" | "OTHER";
  lines: TemplateLine[];
  isSystem: boolean;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Default templates for Slovak s.r.o.
export const DEFAULT_TEMPLATES: Omit<AccountingTemplate, "id" | "createdAt" | "updatedAt">[] = [
  {
    code: "FA_VYDANA",
    name: "Vystavená faktúra za služby",
    description: "Účtovanie vystavenej faktúry za služby",
    category: "INVOICE",
    lines: [
      { accountCode: "311", side: "MD", amountType: "FULL", description: "Pohľadávka" },
      { accountCode: "602", side: "D", amountType: "FULL", description: "Tržby za služby" },
    ],
    isSystem: true,
    isActive: true,
  },
  {
    code: "UHRADA_OD_ODBERATELA",
    name: "Úhrada od odberateľa",
    description: "Príjem platby od odberateľa na bankový účet",
    category: "PAYMENT",
    lines: [
      { accountCode: "221", side: "MD", amountType: "FULL", description: "Príjem na účet" },
      { accountCode: "311", side: "D", amountType: "FULL", description: "Zúčtovanie pohľadávky" },
    ],
    isSystem: true,
    isActive: true,
  },
  {
    code: "FA_PRIJATA",
    name: "Prijatá faktúra za služby",
    description: "Účtovanie prijatej faktúry za služby (vrátane nájmu auta)",
    category: "INVOICE",
    lines: [
      { accountCode: "518", side: "MD", amountType: "FULL", description: "Náklady na služby" },
      { accountCode: "321", side: "D", amountType: "FULL", description: "Záväzok" },
    ],
    isSystem: true,
    isActive: true,
  },
  {
    code: "UHRADA_DODAVATELOVI",
    name: "Úhrada dodávateľovi",
    description: "Platba dodávateľovi z bankového účtu",
    category: "PAYMENT",
    lines: [
      { accountCode: "321", side: "MD", amountType: "FULL", description: "Zúčtovanie záväzku" },
      { accountCode: "221", side: "D", amountType: "FULL", description: "Výdaj z účtu" },
    ],
    isSystem: true,
    isActive: true,
  },
];

// ============================================================================
// PAYROLL CONFIGURATION (Mzdy - konfigurácia)
// ============================================================================

export interface PayrollConfig {
  year: number;
  // Employee contributions (zamestnanec)
  healthInsuranceEmployee: number; // 4%
  socialInsuranceEmployee: number; // 9.4%
  incomeTaxRate: number; // 19% / 25%
  incomeTaxThreshold: number; // Threshold for higher rate
  taxFreeAmount: number; // Nezdaniteľná časť
  // Employer contributions (zamestnávateľ)
  healthInsuranceEmployer: number; // 10%
  socialInsuranceEmployer: number; // 25.2%
}

export const DEFAULT_PAYROLL_CONFIG: PayrollConfig = {
  year: 2026,
  healthInsuranceEmployee: 0.04,
  socialInsuranceEmployee: 0.094,
  incomeTaxRate: 0.19,
  incomeTaxThreshold: 41445.46,
  taxFreeAmount: 4922.82,
  healthInsuranceEmployer: 0.10,
  socialInsuranceEmployer: 0.252,
};

export interface PayrollRun {
  id: string;
  period: string; // YYYY-MM
  employeeName: string;
  grossSalary: number;
  // Calculated values
  healthInsuranceEmployee: number;
  socialInsuranceEmployee: number;
  incomeTaxAdvance: number;
  netSalary: number;
  healthInsuranceEmployer: number;
  socialInsuranceEmployer: number;
  totalEmployerCost: number;
  // Transaction references
  transactionIds: string[];
  status: "DRAFT" | "PROCESSED" | "PAID";
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}

// ============================================================================
// DOCUMENTS (Doklady)
// ============================================================================

export interface Document {
  id: string;
  type: DocumentType;
  number?: string;
  date: Timestamp;
  partnerId?: string;
  partnerName?: string;
  amount: number;
  currency: string;
  description?: string;
  uploadIds: string[];
  transactionId?: string;
  status: "PENDING" | "ACCOUNTED" | "REJECTED";
  extractedData?: any;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}

// ============================================================================
// ACCOUNTING PERIODS (Účtovné obdobia)
// ============================================================================

export interface AccountingPeriod {
  id: string; // YYYY-MM format
  year: number;
  month: number;
  status: PeriodStatus;
  closedAt?: Timestamp;
  closedBy?: string;
  lockedAt?: Timestamp;
  lockedBy?: string;
  notes?: string;
}

// ============================================================================
// TASKS & NOTIFICATIONS (Úlohy a notifikácie)
// ============================================================================

export interface TaskChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  completedAt?: Timestamp;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  category: TaskCategory;
  severity: TaskSeverity;
  dueDate: Timestamp;
  repeatRule?: string; // RRULE-like: "MONTHLY:15" = 15th of each month
  status: TaskStatus;
  checklist: TaskChecklistItem[];
  links: { label: string; path: string }[];
  completedAt?: Timestamp;
  completedBy?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  taskId?: string;
  read: boolean;
  readAt?: Timestamp;
  createdAt: Timestamp;
}

// Default tasks for Slovak s.r.o.
export const DEFAULT_TASKS: Omit<Task, "id" | "dueDate" | "status" | "completedAt" | "completedBy" | "createdAt" | "updatedAt">[] = [
  {
    title: "Spracuj doklady v Inboxe",
    description: "Skontroluj nové doklady, zaúčtuj ich a označ uhradené",
    category: "WEEKLY",
    severity: "MEDIUM",
    repeatRule: "WEEKLY:1", // Every Monday
    checklist: [
      { id: "1", text: "Skontroluj Inbox dokladov", completed: false },
      { id: "2", text: "Zaúčtuj nové doklady", completed: false },
      { id: "3", text: "Označ uhradené v banke", completed: false },
    ],
    links: [
      { label: "Otvoriť Inbox", path: "/doklady" },
      { label: "Otvoriť Banku", path: "/uctovnictvo/banka" },
    ],
  },
  {
    title: "Mzdy: spracuj mzdu + odvody + preddavky",
    description: "Mesačné spracovanie mzdy pre 1 zamestnanca",
    category: "MONTHLY",
    severity: "HIGH",
    repeatRule: "MONTHLY:10", // 10th of each month
    checklist: [
      { id: "1", text: "Vypočítaj hrubú mzdu", completed: false },
      { id: "2", text: "Vypočítaj odvody zamestnanca", completed: false },
      { id: "3", text: "Vypočítaj odvody zamestnávateľa", completed: false },
      { id: "4", text: "Vypočítaj preddavok na daň", completed: false },
      { id: "5", text: "Zaúčtuj mzdu", completed: false },
      { id: "6", text: "Uhraď mzdu z banky", completed: false },
      { id: "7", text: "Uhraď odvody", completed: false },
    ],
    links: [
      { label: "Spustiť Mzdy", path: "/uctovnictvo/mzdy" },
    ],
  },
  {
    title: "Skontroluj 311/321 + Banka (221)",
    description: "Mesačná kontrola pohľadávok, záväzkov a bankového účtu",
    category: "MONTHLY",
    severity: "MEDIUM",
    repeatRule: "MONTHLY:25",
    checklist: [
      { id: "1", text: "Skontroluj neuhradené pohľadávky (311)", completed: false },
      { id: "2", text: "Skontroluj neuhradené záväzky (321)", completed: false },
      { id: "3", text: "Skontroluj zostatok na banke (221)", completed: false },
    ],
    links: [
      { label: "Otvoriť Saldokonto", path: "/uctovnictvo/saldokonto" },
      { label: "Otvoriť Banku", path: "/uctovnictvo/banka" },
    ],
  },
  {
    title: "Spusti mesačnú uzávierku",
    description: "Uzavri účtovné obdobie za uplynulý mesiac",
    category: "MONTHLY",
    severity: "HIGH",
    repeatRule: "MONTHLY:LAST", // Last day of month
    checklist: [
      { id: "1", text: "Inbox = 0 nezaúčtovaných", completed: false },
      { id: "2", text: "311/321 skontrolované", completed: false },
      { id: "3", text: "Banka skontrolovaná", completed: false },
      { id: "4", text: "Export denník + hlavná kniha + saldokonto", completed: false },
      { id: "5", text: "Zamknúť mesiac", completed: false },
    ],
    links: [
      { label: "Spustiť Uzávierku", path: "/uctovnictvo/uzavierky" },
    ],
  },
  {
    title: "Ročná uzávierka",
    description: "Uzavri účtovný rok a priprav podklady pre DPPO a RÚZ",
    category: "YEARLY",
    severity: "CRITICAL",
    repeatRule: "YEARLY:03-31", // March 31st
    checklist: [
      { id: "1", text: "Kontrola celého roka", completed: false },
      { id: "2", text: "Mzdy + odvody skontrolované", completed: false },
      { id: "3", text: "Inventarizácia (banka, 311, 321)", completed: false },
      { id: "4", text: "Export balík (PDF/CSV)", completed: false },
      { id: "5", text: "Príprava podkladov pre DPPO", completed: false },
      { id: "6", text: "Príprava podkladov pre RÚZ", completed: false },
    ],
    links: [
      { label: "Spustiť Uzávierku", path: "/uctovnictvo/uzavierky" },
    ],
  },
  {
    title: "DPPO: pripraviť podklady a podať",
    description: "Priprav a podaj daňové priznanie k dani z príjmov právnických osôb",
    category: "YEARLY",
    severity: "CRITICAL",
    repeatRule: "YEARLY:03-31",
    checklist: [
      { id: "1", text: "Skontroluj výnosy (602)", completed: false },
      { id: "2", text: "Skontroluj náklady (5xx)", completed: false },
      { id: "3", text: "Vypočítaj základ dane", completed: false },
      { id: "4", text: "Vypočítaj daň", completed: false },
      { id: "5", text: "Vyplň formulár DPPO", completed: false },
      { id: "6", text: "Podaj cez eDane", completed: false },
    ],
    links: [
      { label: "Otvoriť Dashboard", path: "/" },
    ],
  },
  {
    title: "RÚZ: uložiť účtovnú závierku",
    description: "Ulož účtovnú závierku do Registra účtovných závierok",
    category: "YEARLY",
    severity: "CRITICAL",
    repeatRule: "YEARLY:06-30",
    checklist: [
      { id: "1", text: "Priprav súvahu", completed: false },
      { id: "2", text: "Priprav výkaz ziskov a strát", completed: false },
      { id: "3", text: "Priprav poznámky", completed: false },
      { id: "4", text: "Ulož do RÚZ", completed: false },
    ],
    links: [],
  },
];

// ============================================================================
// GUIDES (Návody)
// ============================================================================

export interface GuideStep {
  id: string;
  text: string;
  completed: boolean;
  completedAt?: Timestamp;
}

export interface Guide {
  id: string;
  title: string;
  description: string;
  category: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" | "SPECIAL";
  steps: GuideStep[];
  commonMistakes: string[];
  links: { label: string; path: string }[];
  order: number;
}

export const DEFAULT_GUIDES: Omit<Guide, "id">[] = [
  {
    title: "Denná rutina (5 min)",
    description: "Každodenné úkony pre udržanie poriadku v účtovníctve",
    category: "DAILY",
    order: 1,
    steps: [
      { id: "1", text: "Skontroluj Inbox dokladov", completed: false },
      { id: "2", text: "Zaúčtuj nové doklady", completed: false },
      { id: "3", text: "Označ uhradené (banka)", completed: false },
    ],
    commonMistakes: [
      "Nechávanie dokladov v Inboxe dlhšie ako týždeň",
      "Zabudnutie označiť platbu ako uhradenú",
    ],
    links: [
      { label: "Otvoriť Inbox", path: "/doklady" },
      { label: "Otvoriť Banku", path: "/uctovnictvo/banka" },
    ],
  },
  {
    title: "Týždenná rutina",
    description: "Týždenná kontrola stavu účtovníctva",
    category: "WEEKLY",
    order: 2,
    steps: [
      { id: "1", text: "Skontroluj neuhradené 311/321", completed: false },
      { id: "2", text: "Oprav doklady s low-confidence", completed: false },
      { id: "3", text: "Skontroluj zostatok na banke", completed: false },
    ],
    commonMistakes: [
      "Ignorovanie upomienok na neuhradené faktúry",
      "Neopravenie chybne extrahovaných dokladov",
    ],
    links: [
      { label: "Otvoriť Saldokonto", path: "/uctovnictvo/saldokonto" },
    ],
  },
  {
    title: "Mesačná rutina – mzdy (1 zamestnanec)",
    description: "Kompletný postup spracovania mzdy pre 1 zamestnanca",
    category: "MONTHLY",
    order: 3,
    steps: [
      { id: "1", text: "Spracuj mzdu v module Mzdy", completed: false },
      { id: "2", text: "Skontroluj odvody a preddavky", completed: false },
      { id: "3", text: "Potvrď úhrady z banky", completed: false },
      { id: "4", text: "Skontroluj zaúčtovanie (521, 524, 331, 336, 342)", completed: false },
    ],
    commonMistakes: [
      "Zabudnutie na odvody zamestnávateľa",
      "Nesprávny výpočet preddavku na daň",
      "Oneskorená úhrada odvodov",
    ],
    links: [
      { label: "Spustiť Mzdy", path: "/uctovnictvo/mzdy" },
    ],
  },
  {
    title: "Mesačná uzávierka – krok za krokom",
    description: "Postup pre uzavretie účtovného obdobia za mesiac",
    category: "MONTHLY",
    order: 4,
    steps: [
      { id: "1", text: "Inbox = 0 nezaúčtovaných", completed: false },
      { id: "2", text: "311/321 skontrolované", completed: false },
      { id: "3", text: "Banka skontrolovaná", completed: false },
      { id: "4", text: "Export denník + hlavná kniha + saldokonto", completed: false },
      { id: "5", text: "Zamknúť mesiac", completed: false },
    ],
    commonMistakes: [
      "Uzavretie mesiaca s nezaúčtovanými dokladmi",
      "Chýbajúce párovanie platieb",
      "Neexportovanie podkladov pred zamknutím",
    ],
    links: [
      { label: "Spustiť Uzávierku", path: "/uctovnictvo/uzavierky" },
    ],
  },
  {
    title: "Ročná uzávierka – krok za krokom",
    description: "Kompletný postup pre uzavretie účtovného roka",
    category: "YEARLY",
    order: 5,
    steps: [
      { id: "1", text: "Kontrola celého roka (všetky mesiace uzavreté)", completed: false },
      { id: "2", text: "Mzdy + odvody skontrolované", completed: false },
      { id: "3", text: "Inventarizácia (banka, 311, 321)", completed: false },
      { id: "4", text: "Export balík (PDF/CSV)", completed: false },
      { id: "5", text: "Príprava podkladov pre DPPO", completed: false },
      { id: "6", text: "Príprava podkladov pre RÚZ", completed: false },
    ],
    commonMistakes: [
      "Nezrovnalosti medzi bankou a účtovníctvom",
      "Chýbajúce doklady",
      "Nesprávne zaúčtované odpisy",
    ],
    links: [
      { label: "Spustiť Uzávierku", path: "/uctovnictvo/uzavierky" },
    ],
  },
  {
    title: "Auto prenajaté do s.r.o.",
    description: "Ako správne evidovať a účtovať prenájom auta od FO",
    category: "SPECIAL",
    order: 6,
    steps: [
      { id: "1", text: "Eviduj zmluvu o prenájme v Dokumentoch", completed: false },
      { id: "2", text: "Nastav partnera (FO - prenajímateľ)", completed: false },
      { id: "3", text: "Účtuj mesačné nájomné: MD 518 / D 321", completed: false },
      { id: "4", text: "Pri úhrade: MD 321 / D 221", completed: false },
      { id: "5", text: "Kontroluj IBAN/VS na dokladoch", completed: false },
    ],
    commonMistakes: [
      "Chýbajúca zmluva o prenájme",
      "Nesprávny účet (použitie 501 namiesto 518)",
      "Nesprávny VS pri úhrade",
    ],
    links: [
      { label: "Otvoriť Partneri", path: "/partneri" },
      { label: "Otvoriť Šablóny", path: "/uctovnictvo/sablony" },
    ],
  },
];

// ============================================================================
// NOTIFICATION SETTINGS
// ============================================================================

export interface NotificationSettings {
  enabled: boolean;
  dailyReminderTime: string; // HH:MM format
  weeklyReminderDay: number; // 0-6 (Sunday-Saturday)
  quietHoursStart: string; // HH:MM
  quietHoursEnd: string; // HH:MM
  emailNotifications: boolean;
  pushNotifications: boolean;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  dailyReminderTime: "09:00",
  weeklyReminderDay: 1, // Monday
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00",
  emailNotifications: false,
  pushNotifications: true,
};

// ============================================================================
// EXPORTS (Exporty)
// ============================================================================

export interface Export {
  id: string;
  type: "JOURNAL" | "LEDGER" | "BALANCE" | "FULL_BACKUP";
  period: string; // YYYY-MM or YYYY
  format: "PDF" | "CSV" | "XLSX";
  storagePath: string;
  downloadUrl?: string;
  createdAt: Timestamp;
  createdBy: string;
}
