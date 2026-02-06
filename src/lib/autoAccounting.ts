// src/lib/autoAccounting.ts
// Automatic double-entry transaction creation from Entries (Income/Expense)
// When an Entry is created in Inbox, this module creates the corresponding
// Transaction (MD/D) so it appears in Účtovanie, Denník, Hlavná kniha,
// Saldokonto, and Banka automatically.

import { db } from "@/firebase";
import { collection, doc, getDocs, setDoc, Timestamp } from "firebase/firestore";
import type { Entry, EntryType } from "./schemas";
import type { Transaction, TransactionLine, DocumentType } from "./accountingSchemas";

function getCompanyId(): string {
  const stored = localStorage.getItem("gpcs-company-id");
  return stored || "gpcs";
}

// ============================================================================
// ACCOUNT MAPPING
// ============================================================================

interface AccountMapping {
  code: string;
  name: string;
}

/** Maps income categories to revenue accounts (D side) */
const INCOME_REVENUE_ACCOUNTS: Record<string, AccountMapping> = {
  "Tržby za služby":   { code: "602", name: "Tržby z predaja služieb" },
  "Tržby za tovar":    { code: "604", name: "Tržby z predaja tovaru" },
  "Predaj majetku":    { code: "641", name: "Tržby z predaja dlhodobého majetku" },
  "Úroky":             { code: "662", name: "Úroky" },
  "Iné príjmy":        { code: "648", name: "Ostatné výnosy z hospodárskej činnosti" },
};

/** Maps expense categories to expense accounts (MD side) */
const EXPENSE_COST_ACCOUNTS: Record<string, AccountMapping> = {
  "Materiál a tovar":       { code: "501", name: "Spotreba materiálu" },
  "Služby":                 { code: "518", name: "Ostatné služby" },
  "Nájom":                  { code: "518", name: "Ostatné služby" },
  "Energie":                { code: "502", name: "Spotreba energie" },
  "Telefón a internet":     { code: "518", name: "Ostatné služby" },
  "Poistenie":              { code: "548", name: "Ostatné náklady na hospodársku činnosť" },
  "Doprava a PHM":          { code: "512", name: "Cestovné" },
  "Opravy a údržba":        { code: "511", name: "Opravy a udržiavanie" },
  "Mzdy a odvody":          { code: "521", name: "Mzdové náklady" },
  "Dane a poplatky":        { code: "538", name: "Ostatné dane a poplatky" },
  "Bankové poplatky":       { code: "568", name: "Ostatné finančné náklady" },
  "Reprezentácia":          { code: "513", name: "Náklady na reprezentáciu" },
  "Kancelárske potreby":    { code: "501", name: "Spotreba materiálu" },
  "Software a licencie":    { code: "518", name: "Ostatné služby" },
  "Marketing a reklama":    { code: "518", name: "Ostatné služby" },
  "Odpisy":                 { code: "551", name: "Odpisy dlhodobého majetku" },
  "Iné výdavky":            { code: "548", name: "Ostatné náklady na hospodársku činnosť" },
};

const DEFAULT_INCOME_ACCOUNT: AccountMapping =  { code: "602", name: "Tržby z predaja služieb" };
const DEFAULT_EXPENSE_ACCOUNT: AccountMapping = { code: "518", name: "Ostatné služby" };

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Creates a double-entry Transaction from an Entry.
 * 
 * INCOME (vystavená faktúra):  MD 311 (Pohľadávky) / D 6xx (Výnosy)
 * EXPENSE (prijatá faktúra):   MD 5xx (Náklady)    / D 321 (Záväzky)
 * 
 * Returns the created transaction ID.
 */
export async function createTransactionFromEntry(
  entry: Entry,
  userId: string
): Promise<string> {
  const companyId = getCompanyId();
  const entryDate = entry.date instanceof Timestamp ? entry.date.toDate() : new Date(entry.date as any);
  const period = `${entryDate.getFullYear()}-${String(entryDate.getMonth() + 1).padStart(2, "0")}`;

  // Resolve accounts based on type + category
  let mdAccount: AccountMapping;
  let dAccount: AccountMapping;
  let mdPartnerId: string | undefined;
  let mdPartnerName: string | undefined;
  let dPartnerId: string | undefined;
  let dPartnerName: string | undefined;
  let docTypeLabel: string;
  let numberPrefix: string;
  let documentType: DocumentType;

  if (entry.type === "INCOME") {
    // INCOME: MD 311 (Pohľadávky) / D 6xx (Výnosy)
    mdAccount = { code: "311", name: "Pohľadávky z obchodného styku" };
    dAccount = INCOME_REVENUE_ACCOUNTS[entry.category] || DEFAULT_INCOME_ACCOUNT;
    mdPartnerId = entry.partnerId;
    mdPartnerName = entry.partnerSnapshot?.name;
    dPartnerId = entry.partnerId;
    dPartnerName = entry.partnerSnapshot?.name;
    docTypeLabel = "Faktúra vydaná";
    numberPrefix = "VF";
    documentType = "INVOICE_ISSUED";
  } else {
    // EXPENSE: MD 5xx (Náklady) / D 321 (Záväzky)
    mdAccount = EXPENSE_COST_ACCOUNTS[entry.category] || DEFAULT_EXPENSE_ACCOUNT;
    dAccount = { code: "321", name: "Záväzky z obchodného styku" };
    mdPartnerId = entry.partnerId;
    mdPartnerName = entry.partnerSnapshot?.name;
    dPartnerId = entry.partnerId;
    dPartnerName = entry.partnerSnapshot?.name;
    docTypeLabel = "Faktúra prijatá";
    numberPrefix = "PF";
    documentType = "INVOICE_RECEIVED";
  }

  // Generate transaction number
  const transactionsRef = collection(db, "companies", companyId, "transactions");
  const snap = await getDocs(transactionsRef);
  const nextNum = snap.size + 1;
  const number = `${numberPrefix}-${period.replace("-", "")}-${String(nextNum).padStart(4, "0")}`;

  const now = Timestamp.now();
  const newRef = doc(transactionsRef);

  const description = entry.description
    ? `${docTypeLabel} - ${entry.description}`
    : `${docTypeLabel}${entry.partnerSnapshot?.name ? " - " + entry.partnerSnapshot.name : ""}${entry.docNumber ? " (" + entry.docNumber + ")" : ""}`;

  const lines: TransactionLine[] = [
    {
      id: "line-1",
      accountCode: mdAccount.code,
      accountName: mdAccount.name,
      side: "MD",
      amount: entry.amount,
      description: mdAccount.name,
      partnerId: mdPartnerId,
      partnerName: mdPartnerName,
    },
    {
      id: "line-2",
      accountCode: dAccount.code,
      accountName: dAccount.name,
      side: "D",
      amount: entry.amount,
      description: dAccount.name,
      partnerId: dPartnerId,
      partnerName: dPartnerName,
    },
  ];

  const transaction: Transaction & { sourceEntryId: string; sourceEntryType: EntryType } = {
    id: newRef.id,
    number,
    date: entry.date instanceof Timestamp ? entry.date : Timestamp.fromDate(new Date(entry.date as any)),
    description,
    lines,
    totalMd: entry.amount,
    totalD: entry.amount,
    status: "POSTED",
    documentId: entry.sourceDocId || entry.id,
    documentType,
    period,
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
    postedAt: now,
    postedBy: userId,
    sourceEntryId: entry.id,
    sourceEntryType: entry.type,
  };

  await setDoc(newRef, transaction);
  return newRef.id;
}
