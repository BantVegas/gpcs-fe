// src/lib/ruleEngine.ts
// Rule Engine for "Guided Accounting + Guardrails"
// Validates transactions, documents, payroll, and period closing

import { db } from "@/firebase";
import { collection, getDocs, doc, getDoc, Timestamp } from "firebase/firestore";

// ============================================================================
// TYPES
// ============================================================================

export type EntityType = "TRANSACTION" | "DOCUMENT" | "BANK_PAIRING" | "PAYROLL" | "PERIOD_CLOSING";
export type RuleSeverity = "BLOCK" | "WARN" | "INFO";

export interface RuleHit {
  code: string;
  titleSK: string;
  messageSK: string;
  fixSuggestionSK: string;
  severity: RuleSeverity;
  fieldPath?: string;
  linkToGuide?: string;
}

export interface RuleContext {
  companyId: string;
  period?: string; // YYYY-MM
  userId?: string;
}

export interface RuleResult {
  blocks: RuleHit[];
  warnings: RuleHit[];
  infos: RuleHit[];
  isValid: boolean; // true if no blocks
}

export interface TransactionData {
  id?: string;
  description: string;
  date: Date | Timestamp;
  lines: {
    id: string;
    accountCode: string;
    side: "MD" | "D";
    amount: number;
    partnerId?: string;
    partnerName?: string;
    description?: string;
  }[];
  status?: "DRAFT" | "POSTED" | "LOCKED";
  documentId?: string;
  templateId?: string;
}

export interface DocumentData {
  id?: string;
  amount?: number;
  issueDate?: Date | Timestamp;
  partnerId?: string;
  partnerName?: string;
  partnerIco?: string;
  docNumber?: string;
  description?: string;
  confidence?: number;
  extractedFields?: {
    amount?: { value: number; confidence: number };
    supplier?: { value: string; confidence: number };
    docNumber?: { value: string; confidence: number };
  };
  status?: "NEEDS_REVIEW" | "READY" | "ACCOUNTED";
}

export interface BankPairingData {
  movementAmount: number;
  openItemAmount: number;
  openItemRemaining: number;
  partnerId?: string;
  note?: string;
  isPartialPayment: boolean;
}

export interface PayrollData {
  period: string;
  grossSalary: number;
  existingRunForPeriod?: boolean;
  hasPayrollSettings?: boolean;
  createPaymentTransactions?: boolean;
}

export interface PeriodClosingData {
  period: string;
  inboxPendingCount: number;
  draftTransactionCount: number;
  open311Count: number;
  open321Count: number;
  isAlreadyLocked: boolean;
}

// ============================================================================
// RULE ENGINE
// ============================================================================

export async function validateEntity(
  entityType: EntityType,
  data: TransactionData | DocumentData | BankPairingData | PayrollData | PeriodClosingData,
  context: RuleContext
): Promise<RuleResult> {
  const blocks: RuleHit[] = [];
  const warnings: RuleHit[] = [];
  const infos: RuleHit[] = [];

  switch (entityType) {
    case "TRANSACTION":
      await validateTransaction(data as TransactionData, context, blocks, warnings, infos);
      break;
    case "DOCUMENT":
      await validateDocument(data as DocumentData, context, blocks, warnings, infos);
      break;
    case "BANK_PAIRING":
      validateBankPairing(data as BankPairingData, blocks, warnings, infos);
      break;
    case "PAYROLL":
      await validatePayroll(data as PayrollData, context, blocks, warnings, infos);
      break;
    case "PERIOD_CLOSING":
      validatePeriodClosing(data as PeriodClosingData, blocks, warnings, infos);
      break;
  }

  return {
    blocks,
    warnings,
    infos,
    isValid: blocks.length === 0,
  };
}

// ============================================================================
// TRANSACTION RULES
// ============================================================================

async function validateTransaction(
  data: TransactionData,
  context: RuleContext,
  blocks: RuleHit[],
  warnings: RuleHit[],
  infos: RuleHit[]
): Promise<void> {
  // Check if period is locked
  if (context.period) {
    const isLocked = await isPeriodLocked(context.companyId, context.period);
    if (isLocked) {
      blocks.push({
        code: "TRX_PERIOD_LOCKED",
        titleSK: "Obdobie je zamknuté",
        messageSK: `Obdobie ${context.period} je zamknuté. Transakcie v tomto období nie je možné upravovať.`,
        fixSuggestionSK: "Odomknite obdobie v Uzávierkach alebo vytvorte transakciu v inom období.",
        severity: "BLOCK",
        linkToGuide: "/uctovnictvo/uzavierky",
      });
    }
  }

  // BLOCK: Must have at least 1 MD and 1 D line
  const mdLines = data.lines.filter((l) => l.side === "MD");
  const dLines = data.lines.filter((l) => l.side === "D");

  if (mdLines.length === 0) {
    blocks.push({
      code: "TRX_NO_MD_LINE",
      titleSK: "Chýba strana MD",
      messageSK: "Transakcia musí mať aspoň jeden riadok na strane Má dať (MD).",
      fixSuggestionSK: "Pridajte riadok s účtom na stranu MD.",
      severity: "BLOCK",
      fieldPath: "lines",
      linkToGuide: "/uctovnictvo/navody#podvojne-uctovnictvo",
    });
  }

  if (dLines.length === 0) {
    blocks.push({
      code: "TRX_NO_D_LINE",
      titleSK: "Chýba strana D",
      messageSK: "Transakcia musí mať aspoň jeden riadok na strane Dal (D).",
      fixSuggestionSK: "Pridajte riadok s účtom na stranu D.",
      severity: "BLOCK",
      fieldPath: "lines",
      linkToGuide: "/uctovnictvo/navody#podvojne-uctovnictvo",
    });
  }

  // BLOCK: ΣMD must equal ΣD
  const totalMd = mdLines.reduce((sum, l) => sum + l.amount, 0);
  const totalD = dLines.reduce((sum, l) => sum + l.amount, 0);
  const diff = Math.abs(totalMd - totalD);

  if (diff > 0.01) {
    blocks.push({
      code: "TRX_UNBALANCED",
      titleSK: "Transakcia nie je vyvážená",
      messageSK: `Súčet MD (${totalMd.toFixed(2)} €) sa nerovná súčtu D (${totalD.toFixed(2)} €). Rozdiel: ${diff.toFixed(2)} €`,
      fixSuggestionSK: "Skontrolujte sumy na jednotlivých riadkoch. V podvojnom účtovníctve musí platiť ΣMD = ΣD.",
      severity: "BLOCK",
      fieldPath: "lines",
      linkToGuide: "/uctovnictvo/navody#podvojne-uctovnictvo",
    });
  }

  // BLOCK: Amount must be positive
  const negativeLines = data.lines.filter((l) => l.amount <= 0);
  if (negativeLines.length > 0) {
    blocks.push({
      code: "TRX_NEGATIVE_AMOUNT",
      titleSK: "Záporná alebo nulová suma",
      messageSK: `Riadok s účtom ${negativeLines[0].accountCode} má neplatnú sumu (${negativeLines[0].amount} €).`,
      fixSuggestionSK: "Suma musí byť kladné číslo. Ak potrebujete storno, použite opačnú stranu (MD↔D).",
      severity: "BLOCK",
      fieldPath: `lines.${negativeLines[0].id}.amount`,
    });
  }

  // WARN: Missing description
  if (!data.description || data.description.trim().length < 3) {
    warnings.push({
      code: "TRX_NO_DESCRIPTION",
      titleSK: "Chýba popis transakcie",
      messageSK: "Transakcia nemá popis. Bez popisu bude ťažké neskôr identifikovať, o čo išlo.",
      fixSuggestionSK: "Pridajte stručný popis, napr. 'FA 2024001 - Služby IT' alebo 'Mzda 01/2024'.",
      severity: "WARN",
      fieldPath: "description",
    });
  }

  // WARN: 311/321 without partner
  const partnerAccounts = data.lines.filter((l) => 
    (l.accountCode === "311" || l.accountCode === "321") && !l.partnerId
  );
  if (partnerAccounts.length > 0) {
    warnings.push({
      code: "TRX_311_321_NO_PARTNER",
      titleSK: "Pohľadávka/záväzok bez partnera",
      messageSK: `Účet ${partnerAccounts[0].accountCode} (${partnerAccounts[0].accountCode === "311" ? "pohľadávky" : "záväzky"}) nemá priradeného partnera.`,
      fixSuggestionSK: "Pre správne saldokonto priraďte partnera (odberateľa/dodávateľa) k tomuto riadku.",
      severity: "WARN",
      fieldPath: `lines.${partnerAccounts[0].id}.partnerId`,
      linkToGuide: "/uctovnictvo/saldokonto",
    });
  }

  // WARN: Bank transaction without 221
  const has221 = data.lines.some((l) => l.accountCode === "221");
  const hasBankRelatedAccount = data.lines.some((l) => 
    l.accountCode === "311" || l.accountCode === "321" || l.accountCode === "331"
  );
  
  if (data.templateId?.includes("UHRADA") && !has221) {
    warnings.push({
      code: "TRX_PAYMENT_NO_BANK",
      titleSK: "Úhrada bez bankového účtu",
      messageSK: "Transakcia typu 'úhrada' by mala obsahovať účet 221 (banka).",
      fixSuggestionSK: "Pridajte riadok s účtom 221 na príslušnú stranu.",
      severity: "WARN",
      linkToGuide: "/uctovnictvo/banka",
    });
  }

  // INFO: Recommended template
  if (!data.templateId && has221 && hasBankRelatedAccount) {
    infos.push({
      code: "TRX_SUGGEST_TEMPLATE",
      titleSK: "Tip: Použite šablónu",
      messageSK: "Pre bankové pohyby odporúčame použiť predpripravené šablóny účtovania.",
      fixSuggestionSK: "Prejdite do Šablóny účtovania a vyberte vhodnú šablónu pre tento typ operácie.",
      severity: "INFO",
      linkToGuide: "/uctovnictvo/sablony",
    });
  }
}

// ============================================================================
// DOCUMENT RULES
// ============================================================================

async function validateDocument(
  data: DocumentData,
  _context: RuleContext,
  blocks: RuleHit[],
  warnings: RuleHit[],
  infos: RuleHit[]
): Promise<void> {
  // BLOCK: Document without amount
  if (!data.amount || data.amount <= 0) {
    blocks.push({
      code: "DOC_NO_AMOUNT",
      titleSK: "Chýba suma dokladu",
      messageSK: "Doklad nemá zadanú sumu alebo je suma neplatná.",
      fixSuggestionSK: "Zadajte sumu dokladu manuálne alebo skontrolujte AI extrakciu.",
      severity: "BLOCK",
      fieldPath: "amount",
    });
  }

  // BLOCK: Document without date
  if (!data.issueDate) {
    blocks.push({
      code: "DOC_NO_DATE",
      titleSK: "Chýba dátum dokladu",
      messageSK: "Doklad nemá zadaný dátum vystavenia.",
      fixSuggestionSK: "Zadajte dátum dokladu (dátum vystavenia faktúry).",
      severity: "BLOCK",
      fieldPath: "issueDate",
    });
  }

  // WARN: Low confidence extraction
  const LOW_CONFIDENCE_THRESHOLD = 0.7;
  
  if (data.extractedFields?.amount?.confidence && data.extractedFields.amount.confidence < LOW_CONFIDENCE_THRESHOLD) {
    warnings.push({
      code: "DOC_LOW_CONFIDENCE_AMOUNT",
      titleSK: "Nízka istota pri extrakcii sumy",
      messageSK: `AI extrakcia sumy má nízku istotu (${Math.round(data.extractedFields.amount.confidence * 100)}%). Skontrolujte hodnotu.`,
      fixSuggestionSK: "Porovnajte extrahovanú sumu s originálnym dokladom a opravte ak treba.",
      severity: "WARN",
      fieldPath: "amount",
    });
  }

  if (data.extractedFields?.supplier?.confidence && data.extractedFields.supplier.confidence < LOW_CONFIDENCE_THRESHOLD) {
    warnings.push({
      code: "DOC_LOW_CONFIDENCE_SUPPLIER",
      titleSK: "Nízka istota pri extrakcii dodávateľa",
      messageSK: `AI extrakcia dodávateľa má nízku istotu (${Math.round(data.extractedFields.supplier.confidence * 100)}%).`,
      fixSuggestionSK: "Skontrolujte názov dodávateľa a jeho IČO.",
      severity: "WARN",
      fieldPath: "partnerId",
    });
  }

  // WARN: Supplier without ICO
  if (data.partnerName && !data.partnerIco) {
    warnings.push({
      code: "DOC_SUPPLIER_NO_ICO",
      titleSK: "Dodávateľ bez IČO",
      messageSK: `Dodávateľ "${data.partnerName}" nemá zadané IČO.`,
      fixSuggestionSK: "Vyhľadajte IČO dodávateľa a doplňte ho pre správnu identifikáciu.",
      severity: "WARN",
      fieldPath: "partnerIco",
      linkToGuide: "/partneri",
    });
  }

  // WARN: Missing document number
  if (!data.docNumber) {
    warnings.push({
      code: "DOC_NO_NUMBER",
      titleSK: "Chýba číslo dokladu",
      messageSK: "Doklad nemá zadané číslo (číslo faktúry).",
      fixSuggestionSK: "Doplňte číslo dokladu pre lepšiu identifikáciu a párovanie platieb.",
      severity: "WARN",
      fieldPath: "docNumber",
    });
  }

  // INFO: Recommended template based on document type
  if (data.amount && data.amount > 0) {
    infos.push({
      code: "DOC_SUGGEST_TEMPLATE",
      titleSK: "Odporúčaná šablóna",
      messageSK: "Pre prijatú faktúru za služby použite šablónu 'Prijatá FA (služby)': MD 518 / D 321.",
      fixSuggestionSK: "Vyberte šablónu pri zaúčtovaní dokladu.",
      severity: "INFO",
      linkToGuide: "/uctovnictvo/sablony",
    });
  }
}

// ============================================================================
// BANK PAIRING RULES
// ============================================================================

function validateBankPairing(
  data: BankPairingData,
  blocks: RuleHit[],
  warnings: RuleHit[],
  infos: RuleHit[]
): void {
  // BLOCK: Payment exceeds open item remaining
  if (Math.abs(data.movementAmount) > data.openItemRemaining + 0.01) {
    blocks.push({
      code: "BANK_OVERPAYMENT",
      titleSK: "Preplatenie otvorenej položky",
      messageSK: `Suma úhrady (${Math.abs(data.movementAmount).toFixed(2)} €) presahuje zostatok otvorenej položky (${data.openItemRemaining.toFixed(2)} €).`,
      fixSuggestionSK: "Znížte sumu párovania alebo vyberte inú otvorenú položku. Ak ide o preplatok, vytvorte novú pohľadávku/záväzok.",
      severity: "BLOCK",
      fieldPath: "amount",
    });
  }

  // WARN: Partial payment without note
  if (data.isPartialPayment && !data.note) {
    warnings.push({
      code: "BANK_PARTIAL_NO_NOTE",
      titleSK: "Čiastočná úhrada bez poznámky",
      messageSK: "Párujete čiastočnú úhradu bez poznámky. Neskôr môže byť ťažké identifikovať dôvod.",
      fixSuggestionSK: "Pridajte poznámku vysvetľujúcu čiastočnú úhradu (napr. 'Záloha', 'Splátka 1/3').",
      severity: "WARN",
      fieldPath: "note",
    });
  }

  // WARN: No partner
  if (!data.partnerId) {
    warnings.push({
      code: "BANK_NO_PARTNER",
      titleSK: "Úhrada bez partnera",
      messageSK: "Bankový pohyb nemá priradeného partnera.",
      fixSuggestionSK: "Pre správne saldokonto priraďte partnera k tejto úhrade.",
      severity: "WARN",
      fieldPath: "partnerId",
    });
  }

  // INFO: Suggest creating open item
  if (data.openItemRemaining <= 0) {
    infos.push({
      code: "BANK_NO_OPEN_ITEM",
      titleSK: "Žiadna otvorená položka",
      messageSK: "Pre tohto partnera neexistuje otvorená položka na párovanie.",
      fixSuggestionSK: "Najprv zaúčtujte faktúru (vytvorí sa pohľadávka/záväzok), potom spárujte platbu.",
      severity: "INFO",
      linkToGuide: "/uctovnictvo/saldokonto",
    });
  }
}

// ============================================================================
// PAYROLL RULES
// ============================================================================

async function validatePayroll(
  data: PayrollData,
  _context: RuleContext,
  blocks: RuleHit[],
  warnings: RuleHit[],
  infos: RuleHit[]
): Promise<void> {
  // BLOCK: Duplicate payroll run
  if (data.existingRunForPeriod) {
    blocks.push({
      code: "PAYROLL_DUPLICATE",
      titleSK: "Duplicitný mzdový výpočet",
      messageSK: `Pre obdobie ${data.period} už existuje mzdový výpočet.`,
      fixSuggestionSK: "Vymažte existujúci výpočet alebo vyberte iné obdobie.",
      severity: "BLOCK",
      fieldPath: "period",
      linkToGuide: "/uctovnictvo/mzdy",
    });
  }

  // BLOCK: Invalid gross salary
  if (data.grossSalary <= 0) {
    blocks.push({
      code: "PAYROLL_INVALID_SALARY",
      titleSK: "Neplatná hrubá mzda",
      messageSK: "Hrubá mzda musí byť kladné číslo.",
      fixSuggestionSK: "Zadajte platnú hrubú mzdu.",
      severity: "BLOCK",
      fieldPath: "grossSalary",
    });
  }

  // WARN: Missing payroll settings
  if (!data.hasPayrollSettings) {
    warnings.push({
      code: "PAYROLL_NO_SETTINGS",
      titleSK: "Chýbajú nastavenia miezd",
      messageSK: "Nie sú nastavené sadzby pre výpočet miezd. Použijú sa predvolené hodnoty.",
      fixSuggestionSK: "Prejdite do Nastavenia miezd a skontrolujte/upravte sadzby odvodov a dane.",
      severity: "WARN",
      linkToGuide: "/uctovnictvo/mzdy",
    });
  }

  // INFO: Auto-generated transactions
  if (data.createPaymentTransactions) {
    infos.push({
      code: "PAYROLL_AUTO_TRANSACTIONS",
      titleSK: "Automatické transakcie",
      messageSK: "Systém automaticky vytvorí 4 transakcie: mzdový náklad, výplata mzdy, úhrada odvodov, úhrada dane.",
      fixSuggestionSK: "Po vytvorení skontrolujte transakcie v Účtovnom denníku.",
      severity: "INFO",
      linkToGuide: "/uctovnictvo/dennik",
    });
  }
}

// ============================================================================
// PERIOD CLOSING RULES
// ============================================================================

function validatePeriodClosing(
  data: PeriodClosingData,
  blocks: RuleHit[],
  warnings: RuleHit[],
  infos: RuleHit[]
): void {
  // BLOCK: Already locked
  if (data.isAlreadyLocked) {
    blocks.push({
      code: "CLOSING_ALREADY_LOCKED",
      titleSK: "Obdobie je už zamknuté",
      messageSK: `Obdobie ${data.period} je už zamknuté.`,
      fixSuggestionSK: "Ak potrebujete zmeny, najprv odomknite obdobie.",
      severity: "BLOCK",
    });
  }

  // BLOCK: Pending documents in inbox
  if (data.inboxPendingCount > 0) {
    blocks.push({
      code: "CLOSING_INBOX_NOT_EMPTY",
      titleSK: "Nezaúčtované doklady v Inboxe",
      messageSK: `V Inboxe je ${data.inboxPendingCount} nezaúčtovaných dokladov pre toto obdobie.`,
      fixSuggestionSK: "Zaúčtujte alebo odmietnutie všetky doklady pred uzávierkou.",
      severity: "BLOCK",
      linkToGuide: "/doklady",
    });
  }

  // BLOCK: Draft transactions
  if (data.draftTransactionCount > 0) {
    blocks.push({
      code: "CLOSING_DRAFT_TRANSACTIONS",
      titleSK: "Nezaúčtované transakcie",
      messageSK: `Existuje ${data.draftTransactionCount} transakcií v stave DRAFT.`,
      fixSuggestionSK: "Zaúčtujte (POST) alebo zmažte všetky koncepty pred uzávierkou.",
      severity: "BLOCK",
      linkToGuide: "/uctovnictvo/transakcie",
    });
  }

  // WARN: Open 311 items
  if (data.open311Count > 0) {
    warnings.push({
      code: "CLOSING_OPEN_311",
      titleSK: "Otvorené pohľadávky",
      messageSK: `Existuje ${data.open311Count} neuhradených pohľadávok (311).`,
      fixSuggestionSK: "Skontrolujte saldokonto 311. Ak sú správne, pokračujte. Ak nie, spárujte platby.",
      severity: "WARN",
      linkToGuide: "/uctovnictvo/saldokonto",
    });
  }

  // WARN: Open 321 items
  if (data.open321Count > 0) {
    warnings.push({
      code: "CLOSING_OPEN_321",
      titleSK: "Otvorené záväzky",
      messageSK: `Existuje ${data.open321Count} neuhradených záväzkov (321).`,
      fixSuggestionSK: "Skontrolujte saldokonto 321. Ak sú správne, pokračujte. Ak nie, spárujte platby.",
      severity: "WARN",
      linkToGuide: "/uctovnictvo/saldokonto",
    });
  }

  // INFO: What locking means
  infos.push({
    code: "CLOSING_INFO_LOCK",
    titleSK: "Čo znamená zamknutie",
    messageSK: "Po zamknutí nebude možné upravovať ani mazať transakcie v tomto období.",
    fixSuggestionSK: "Uistite sa, že všetko je správne. V prípade potreby môžete obdobie neskôr odomknúť.",
    severity: "INFO",
  });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function isPeriodLocked(companyId: string, period: string): Promise<boolean> {
  try {
    const lockRef = doc(db, "companies", companyId, "periodLocks", period);
    const lockSnap = await getDoc(lockRef);
    if (lockSnap.exists()) {
      const data = lockSnap.data();
      return data.status === "LOCKED";
    }
    return false;
  } catch {
    return false;
  }
}

// ============================================================================
// AUDIT LOGGING
// ============================================================================

export interface AuditLogEntry {
  type: "OVERRIDE_WARNING" | "VALIDATION_BLOCK" | "PERIOD_LOCK" | "PERIOD_UNLOCK";
  ruleCodes: string[];
  entityType: EntityType;
  entityId?: string;
  ref?: {
    transactionId?: string;
    documentId?: string;
    period?: string;
  };
  at: Timestamp;
  by: string;
  notes?: string;
}

export async function logAuditEntry(
  companyId: string,
  entry: Omit<AuditLogEntry, "at">
): Promise<void> {
  const { collection: coll, doc: docFn, setDoc } = await import("firebase/firestore");
  const auditRef = coll(db, "companies", companyId, "audit");
  const newRef = docFn(auditRef);
  await setDoc(newRef, {
    ...entry,
    id: newRef.id,
    at: Timestamp.now(),
  });
}

// ============================================================================
// QUALITY SCORE CALCULATION
// ============================================================================

export interface QualityScore {
  inboxPending: number;
  lowConfidenceDocs: number;
  unpairedBankMovements: number;
  open311Items: number;
  open321Items: number;
  lockedMonths: number;
  totalMonths: number;
  score: number; // 0-100
  grade: "A" | "B" | "C" | "D" | "F";
}

export async function calculateQualityScore(companyId: string): Promise<QualityScore> {
  const defaultScore: QualityScore = {
    inboxPending: 0,
    lowConfidenceDocs: 0,
    unpairedBankMovements: 0,
    open311Items: 0,
    open321Items: 0,
    lockedMonths: 0,
    totalMonths: new Date().getMonth() + 1,
    score: 100,
    grade: "A",
  };
  
  // Return default if no companyId
  if (!companyId) {
    return defaultScore;
  }
  
  let inboxPending = 0;
  let lowConfidenceDocs = 0;
  let unpairedBankMovements = 0;
  let open311Items = 0;
  let open321Items = 0;
  let lockedMonths = 0;
  
  try {
    // Count pending uploads
    const uploadsRef = collection(db, "companies", companyId, "uploads");
    const uploadsSnap = await getDocs(uploadsRef);
    uploadsSnap.docs.forEach((d) => {
      const data = d.data();
      if (data.status === "NEEDS_REVIEW" || data.status === "EXTRACTED") {
        inboxPending++;
        if (data.confidence && data.confidence < 0.7) {
          lowConfidenceDocs++;
        }
      }
    });

    // Count transactions for open items and unpaired bank
    const transactionsRef = collection(db, "companies", companyId, "transactions");
    const transactionsSnap = await getDocs(transactionsRef);
    
    const partnerBalances311 = new Map<string, number>();
    const partnerBalances321 = new Map<string, number>();
    
    transactionsSnap.docs.forEach((d) => {
      const tx = d.data();
      if (tx.status === "DRAFT") return;
      
      tx.lines?.forEach((line: any) => {
        if (line.accountCode === "311" && line.partnerId) {
          const current = partnerBalances311.get(line.partnerId) || 0;
          partnerBalances311.set(line.partnerId, current + (line.side === "MD" ? line.amount : -line.amount));
        }
        if (line.accountCode === "321" && line.partnerId) {
          const current = partnerBalances321.get(line.partnerId) || 0;
          partnerBalances321.set(line.partnerId, current + (line.side === "D" ? line.amount : -line.amount));
        }
      });
    });
    
    partnerBalances311.forEach((balance) => {
      if (Math.abs(balance) > 0.01) open311Items++;
    });
    partnerBalances321.forEach((balance) => {
      if (Math.abs(balance) > 0.01) open321Items++;
    });

    // Count locked periods
    const locksRef = collection(db, "companies", companyId, "periodLocks");
    const locksSnap = await getDocs(locksRef);
    locksSnap.docs.forEach((d) => {
      if (d.data().status === "LOCKED") lockedMonths++;
    });
  } catch (err) {
    console.error("Error calculating quality score:", err);
    // Return default score on error (e.g., missing permissions)
    return defaultScore;
  }

  // Calculate score (simple weighted formula)
  const currentMonth = new Date().getMonth() + 1;
  const totalMonths = currentMonth;
  
  let score = 100;
  score -= inboxPending * 5; // -5 per pending doc
  score -= lowConfidenceDocs * 3; // -3 per low confidence
  score -= unpairedBankMovements * 2; // -2 per unpaired
  score -= (open311Items + open321Items) * 1; // -1 per open item
  score += lockedMonths * 2; // +2 per locked month
  
  score = Math.max(0, Math.min(100, score));
  
  let grade: "A" | "B" | "C" | "D" | "F";
  if (score >= 90) grade = "A";
  else if (score >= 80) grade = "B";
  else if (score >= 70) grade = "C";
  else if (score >= 60) grade = "D";
  else grade = "F";

  return {
    inboxPending,
    lowConfidenceDocs,
    unpairedBankMovements,
    open311Items,
    open321Items,
    lockedMonths,
    totalMonths,
    score: Math.round(score),
    grade,
  };
}
