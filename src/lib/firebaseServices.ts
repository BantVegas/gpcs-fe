// src/lib/firebaseServices.ts
// Firebase services for GPCS Ucto - Firestore operations

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  limit,
  Timestamp,
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db, storage, app } from "@/firebase";

const functions = getFunctions(app, "europe-west1");
import type {
  Entry,
  Partner,
  InvoiceIssued,
  InvoiceReceived,
  Upload,
  CompanySettings,
  EntryType,
  PaymentStatus,
} from "./schemas";
import { DEFAULT_COMPANY_SETTINGS } from "./schemas";
import { createTransactionFromEntry } from "./autoAccounting";

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_COMPANY_ID = "gpcs";

export function getCompanyId(): string {
  return DEFAULT_COMPANY_ID;
}

// ============================================================================
// SETTINGS
// ============================================================================

export async function getSettings(): Promise<CompanySettings> {
  const companyId = getCompanyId();
  const ref = doc(db, "companies", companyId, "settings", "main");
  const snap = await getDoc(ref);
  
  if (snap.exists()) {
    return snap.data() as CompanySettings;
  }
  
  await setDoc(ref, DEFAULT_COMPANY_SETTINGS);
  return DEFAULT_COMPANY_SETTINGS;
}

export async function updateSettings(settings: Partial<CompanySettings>): Promise<void> {
  const companyId = getCompanyId();
  const ref = doc(db, "companies", companyId, "settings", "main");
  await setDoc(ref, settings, { merge: true });
}

export function subscribeToSettings(
  callback: (settings: CompanySettings) => void
): Unsubscribe {
  const companyId = getCompanyId();
  const ref = doc(db, "companies", companyId, "settings", "main");
  
  return onSnapshot(ref, (snap) => {
    if (snap.exists()) {
      callback(snap.data() as CompanySettings);
    } else {
      callback(DEFAULT_COMPANY_SETTINGS);
    }
  });
}

// ============================================================================
// ENTRIES
// ============================================================================

export async function getEntries(filters?: {
  type?: EntryType;
  year?: number;
  month?: number;
  category?: string;
  partnerId?: string;
  paymentStatus?: PaymentStatus;
}): Promise<Entry[]> {
  const companyId = getCompanyId();
  const entriesRef = collection(db, "companies", companyId, "entries");
  
  const q = query(entriesRef);
  const snap = await getDocs(q);
  let entries = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Entry));
  
  if (filters?.type) {
    entries = entries.filter((e) => e.type === filters.type);
  }
  
  entries.sort((a, b) => {
    const dateA = a.date instanceof Timestamp ? a.date.toDate() : new Date(a.date);
    const dateB = b.date instanceof Timestamp ? b.date.toDate() : new Date(b.date);
    return dateB.getTime() - dateA.getTime();
  });
  
  if (filters?.year) {
    const startOfYear = new Date(filters.year, 0, 1);
    const endOfYear = new Date(filters.year + 1, 0, 1);
    entries = entries.filter((e) => {
      const date = e.date.toDate();
      return date >= startOfYear && date < endOfYear;
    });
  }
  
  if (filters?.month !== undefined && filters?.year) {
    const startOfMonth = new Date(filters.year, filters.month, 1);
    const endOfMonth = new Date(filters.year, filters.month + 1, 1);
    entries = entries.filter((e) => {
      const date = e.date.toDate();
      return date >= startOfMonth && date < endOfMonth;
    });
  }
  
  if (filters?.category) {
    entries = entries.filter((e) => e.category === filters.category);
  }
  
  if (filters?.partnerId) {
    entries = entries.filter((e) => e.partnerId === filters.partnerId);
  }
  
  if (filters?.paymentStatus) {
    entries = entries.filter((e) => e.payment.status === filters.paymentStatus);
  }
  
  return entries;
}

export async function getEntry(id: string): Promise<Entry | null> {
  const companyId = getCompanyId();
  const ref = doc(db, "companies", companyId, "entries", id);
  const snap = await getDoc(ref);
  
  if (snap.exists()) {
    return { id: snap.id, ...snap.data() } as Entry;
  }
  return null;
}

export async function createEntry(
  entry: Omit<Entry, "id" | "createdAt" | "updatedAt">
): Promise<string> {
  const companyId = getCompanyId();
  const entriesRef = collection(db, "companies", companyId, "entries");
  const newRef = doc(entriesRef);
  const now = Timestamp.now();
  
  const fullEntry = {
    ...entry,
    id: newRef.id,
    createdAt: now,
    updatedAt: now,
  };
  
  await setDoc(newRef, fullEntry);
  
  // Auto-create double-entry transaction (MD/D) so it appears in
  // Účtovanie, Denník, Hlavná kniha, Saldokonto, and Banka
  try {
    await createTransactionFromEntry(fullEntry as Entry, entry.createdBy);
  } catch (err) {
    console.error("Auto-accounting failed for entry", newRef.id, err);
  }
  
  return newRef.id;
}

export async function updateEntry(
  id: string,
  data: Partial<Entry>
): Promise<void> {
  const companyId = getCompanyId();
  const ref = doc(db, "companies", companyId, "entries", id);
  
  // Remove undefined values which Firestore doesn't support
  const cleanData: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      cleanData[key] = value;
    }
  }
  
  await updateDoc(ref, {
    ...cleanData,
    updatedAt: Timestamp.now(),
  });
}

export async function deleteEntry(id: string): Promise<void> {
  const companyId = getCompanyId();
  const ref = doc(db, "companies", companyId, "entries", id);
  await deleteDoc(ref);
}

export function subscribeToEntries(
  callback: (entries: Entry[]) => void,
  filters?: { type?: EntryType; year?: number }
): Unsubscribe {
  const companyId = getCompanyId();
  const entriesRef = collection(db, "companies", companyId, "entries");
  
  const q = query(entriesRef);
  
  return onSnapshot(q, (snap) => {
    let entries = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Entry));
    
    if (filters?.type) {
      entries = entries.filter((e) => e.type === filters.type);
    }
    
    if (filters?.year) {
      const startOfYear = new Date(filters.year, 0, 1);
      const endOfYear = new Date(filters.year + 1, 0, 1);
      entries = entries.filter((e) => {
        const date = e.date instanceof Timestamp ? e.date.toDate() : new Date(e.date);
        return date >= startOfYear && date < endOfYear;
      });
    }
    
    entries.sort((a, b) => {
      const dateA = a.date instanceof Timestamp ? a.date.toDate() : new Date(a.date);
      const dateB = b.date instanceof Timestamp ? b.date.toDate() : new Date(b.date);
      return dateB.getTime() - dateA.getTime();
    });
    
    callback(entries);
  });
}

// ============================================================================
// PARTNERS
// ============================================================================

export async function getPartners(): Promise<Partner[]> {
  const companyId = getCompanyId();
  const partnersRef = collection(db, "companies", companyId, "partners");
  const q = query(partnersRef);
  const snap = await getDocs(q);
  
  const partners = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Partner));
  partners.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  return partners;
}

export async function getPartner(id: string): Promise<Partner | null> {
  const companyId = getCompanyId();
  const ref = doc(db, "companies", companyId, "partners", id);
  const snap = await getDoc(ref);
  
  if (snap.exists()) {
    return { id: snap.id, ...snap.data() } as Partner;
  }
  return null;
}

export async function getPartnerByICO(ico: string): Promise<Partner | null> {
  const companyId = getCompanyId();
  const partnersRef = collection(db, "companies", companyId, "partners");
  const q = query(partnersRef, where("ico", "==", ico), limit(1));
  const snap = await getDocs(q);
  
  if (!snap.empty) {
    const d = snap.docs[0];
    return { id: d.id, ...d.data() } as Partner;
  }
  return null;
}

export async function createPartner(
  partner: Omit<Partner, "id" | "createdAt" | "updatedAt">
): Promise<string> {
  const companyId = getCompanyId();
  const partnersRef = collection(db, "companies", companyId, "partners");
  const newRef = doc(partnersRef);
  const now = Timestamp.now();
  
  await setDoc(newRef, {
    ...partner,
    id: newRef.id,
    createdAt: now,
    updatedAt: now,
  });
  
  return newRef.id;
}

export async function updatePartner(
  id: string,
  data: Partial<Partner>
): Promise<void> {
  const companyId = getCompanyId();
  const ref = doc(db, "companies", companyId, "partners", id);
  await updateDoc(ref, {
    ...data,
    updatedAt: Timestamp.now(),
  });
}

export async function deletePartner(id: string): Promise<void> {
  const companyId = getCompanyId();
  const ref = doc(db, "companies", companyId, "partners", id);
  await deleteDoc(ref);
}

export function subscribeToPartners(
  callback: (partners: Partner[]) => void
): Unsubscribe {
  const companyId = getCompanyId();
  const partnersRef = collection(db, "companies", companyId, "partners");
  const q = query(partnersRef);
  
  return onSnapshot(q, (snap) => {
    const partners = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Partner));
    partners.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    callback(partners);
  });
}

// ============================================================================
// INVOICES ISSUED
// ============================================================================

export async function getInvoicesIssued(): Promise<InvoiceIssued[]> {
  const companyId = getCompanyId();
  const invoicesRef = collection(db, "companies", companyId, "invoicesIssued");
  const q = query(invoicesRef);
  const snap = await getDocs(q);
  
  const invoices = snap.docs.map((d) => ({ id: d.id, ...d.data() } as InvoiceIssued));
  invoices.sort((a, b) => {
    const dateA = a.issueDate instanceof Timestamp ? a.issueDate.toDate() : new Date(a.issueDate);
    const dateB = b.issueDate instanceof Timestamp ? b.issueDate.toDate() : new Date(b.issueDate);
    return dateB.getTime() - dateA.getTime();
  });
  return invoices;
}

export async function createInvoiceIssued(
  invoice: Omit<InvoiceIssued, "id" | "createdAt" | "updatedAt">
): Promise<string> {
  const companyId = getCompanyId();
  const invoicesRef = collection(db, "companies", companyId, "invoicesIssued");
  const newRef = doc(invoicesRef);
  const now = Timestamp.now();
  
  await setDoc(newRef, {
    ...invoice,
    id: newRef.id,
    createdAt: now,
    updatedAt: now,
  });
  
  return newRef.id;
}

export function subscribeToInvoicesIssued(
  callback: (invoices: InvoiceIssued[]) => void
): Unsubscribe {
  const companyId = getCompanyId();
  const invoicesRef = collection(db, "companies", companyId, "invoicesIssued");
  const q = query(invoicesRef);
  
  return onSnapshot(q, (snap) => {
    const invoices = snap.docs.map((d) => ({ id: d.id, ...d.data() } as InvoiceIssued));
    invoices.sort((a, b) => {
      const dateA = a.issueDate instanceof Timestamp ? a.issueDate.toDate() : new Date(a.issueDate);
      const dateB = b.issueDate instanceof Timestamp ? b.issueDate.toDate() : new Date(b.issueDate);
      return dateB.getTime() - dateA.getTime();
    });
    callback(invoices);
  });
}

// ============================================================================
// INVOICES RECEIVED
// ============================================================================

export async function getInvoicesReceived(): Promise<InvoiceReceived[]> {
  const companyId = getCompanyId();
  const invoicesRef = collection(db, "companies", companyId, "invoicesReceived");
  const q = query(invoicesRef);
  const snap = await getDocs(q);
  
  const invoices = snap.docs.map((d) => ({ id: d.id, ...d.data() } as InvoiceReceived));
  invoices.sort((a, b) => {
    const dateA = a.receivedDate instanceof Timestamp ? a.receivedDate.toDate() : new Date(a.receivedDate);
    const dateB = b.receivedDate instanceof Timestamp ? b.receivedDate.toDate() : new Date(b.receivedDate);
    return dateB.getTime() - dateA.getTime();
  });
  return invoices;
}

export async function createInvoiceReceived(
  invoice: Omit<InvoiceReceived, "id" | "createdAt" | "updatedAt">
): Promise<string> {
  const companyId = getCompanyId();
  const invoicesRef = collection(db, "companies", companyId, "invoicesReceived");
  const newRef = doc(invoicesRef);
  const now = Timestamp.now();
  
  await setDoc(newRef, {
    ...invoice,
    id: newRef.id,
    createdAt: now,
    updatedAt: now,
  });
  
  return newRef.id;
}

export function subscribeToInvoicesReceived(
  callback: (invoices: InvoiceReceived[]) => void
): Unsubscribe {
  const companyId = getCompanyId();
  const invoicesRef = collection(db, "companies", companyId, "invoicesReceived");
  const q = query(invoicesRef);
  
  return onSnapshot(q, (snap) => {
    const invoices = snap.docs.map((d) => ({ id: d.id, ...d.data() } as InvoiceReceived));
    invoices.sort((a, b) => {
      const dateA = a.receivedDate instanceof Timestamp ? a.receivedDate.toDate() : new Date(a.receivedDate);
      const dateB = b.receivedDate instanceof Timestamp ? b.receivedDate.toDate() : new Date(b.receivedDate);
      return dateB.getTime() - dateA.getTime();
    });
    callback(invoices);
  });
}

// ============================================================================
// UPLOADS
// ============================================================================

export async function getUploads(): Promise<Upload[]> {
  const companyId = getCompanyId();
  const uploadsRef = collection(db, "companies", companyId, "uploads");
  const q = query(uploadsRef);
  const snap = await getDocs(q);
  
  const uploads = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Upload));
  uploads.sort((a, b) => {
    const dateA = a.createdAt instanceof Timestamp ? a.createdAt.toDate() : new Date(a.createdAt);
    const dateB = b.createdAt instanceof Timestamp ? b.createdAt.toDate() : new Date(b.createdAt);
    return dateB.getTime() - dateA.getTime();
  });
  return uploads;
}

export async function createUpload(
  file: File,
  userId: string
): Promise<string> {
  const companyId = getCompanyId();
  console.log("createUpload: companyId=", companyId, "userId=", userId);
  
  const uploadsRef = collection(db, "companies", companyId, "uploads");
  const newRef = doc(uploadsRef);
  const now = Timestamp.now();
  
  const storagePath = `companies/${companyId}/uploads/${newRef.id}/${file.name}`;
  console.log("createUpload: storagePath=", storagePath);
  
  const storageRef = ref(storage, storagePath);
  console.log("createUpload: storageRef created, bucket=", storageRef.bucket);
  
  // Use resumable upload for better CORS handling
  console.log("createUpload: starting upload...");
  const uploadTask = uploadBytesResumable(storageRef, file);
  
  await new Promise<void>((resolve, reject) => {
    uploadTask.on(
      "state_changed",
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        console.log("Upload progress:", progress.toFixed(0) + "%");
      },
      (error) => {
        console.error("Upload error:", error.code, error.message);
        reject(error);
      },
      () => {
        console.log("Upload complete!");
        resolve();
      }
    );
  });
  
  // Get download URL
  console.log("createUpload: getting download URL...");
  const downloadUrl = await getDownloadURL(storageRef);
  console.log("createUpload: downloadUrl=", downloadUrl);
  
  const upload: Upload = {
    id: newRef.id,
    fileName: file.name,
    storagePath,
    downloadUrl,
    mime: file.type,
    size: file.size,
    status: "UPLOADED",
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
  };
  
  await setDoc(newRef, upload);
  console.log("createUpload: saved to Firestore");
  return newRef.id;
}

export async function updateUpload(
  id: string,
  data: Partial<Upload>
): Promise<void> {
  const companyId = getCompanyId();
  const ref = doc(db, "companies", companyId, "uploads", id);
  await updateDoc(ref, {
    ...data,
    updatedAt: Timestamp.now(),
  });
}

export async function deleteUpload(id: string): Promise<void> {
  const companyId = getCompanyId();
  const uploadRef = doc(db, "companies", companyId, "uploads", id);
  await deleteDoc(uploadRef);
}

export function subscribeToUploads(
  callback: (uploads: Upload[]) => void
): Unsubscribe {
  const companyId = getCompanyId();
  const uploadsRef = collection(db, "companies", companyId, "uploads");
  const q = query(uploadsRef);
  
  return onSnapshot(q, (snap) => {
    const uploads = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Upload));
    uploads.sort((a, b) => {
      const dateA = a.createdAt instanceof Timestamp ? a.createdAt.toDate() : new Date(a.createdAt);
      const dateB = b.createdAt instanceof Timestamp ? b.createdAt.toDate() : new Date(b.createdAt);
      return dateB.getTime() - dateA.getTime();
    });
    callback(uploads);
  });
}

// Extract invoice data from uploaded file using AI
export async function extractInvoiceFromUpload(uploadId: string): Promise<any> {
  const companyId = getCompanyId();
  const extractInvoice = httpsCallable(functions, "extractInvoice");
  const result = await extractInvoice({ uploadId, companyId });
  return (result.data as any);
}

// Create entry from extracted invoice data
export async function createEntryFromExtractedData(
  uploadId: string,
  extractedData: any,
  userId: string,
  fallbackType?: EntryType
): Promise<string> {
  // Determine entry type from AI extraction or fallback
  let entryType: EntryType;
  if (extractedData.invoiceType === "RECEIVED") {
    entryType = "EXPENSE"; // Prijata faktura = vydavok
  } else if (extractedData.invoiceType === "ISSUED") {
    entryType = "INCOME"; // Vydana faktura = prijem
  } else {
    entryType = fallbackType || "EXPENSE"; // Default to expense for received invoices
  }
  const companyId = getCompanyId();
  
  // Create or find partner from supplier data
  let partnerId: string | undefined;
  let partnerSnapshot: any = {};
  
  if (extractedData.supplier) {
    const supplier = extractedData.supplier;
    // Check if partner exists by ICO
    if (supplier.ico) {
      const partnersRef = collection(db, "companies", companyId, "partners");
      const q = query(partnersRef, where("ico", "==", supplier.ico), limit(1));
      const snap = await getDocs(q);
      
      if (snap.empty) {
        // Create new partner
        const newPartnerRef = doc(partnersRef);
        const newPartner: Partner = {
          id: newPartnerRef.id,
          name: supplier.name || "",
          ico: supplier.ico,
          dic: supplier.dic || "",
          icdph: supplier.icdph || "",
          street: supplier.street || "",
          city: supplier.city || "",
          zip: supplier.zip || "",
          country: supplier.country || "Slovensko",
          source: "ICO_LOOKUP",
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        };
        await setDoc(newPartnerRef, newPartner);
        partnerId = newPartnerRef.id;
        partnerSnapshot = {
          name: newPartner.name,
          ico: newPartner.ico,
          dic: newPartner.dic,
          icdph: newPartner.icdph,
        };
      } else {
        const existingPartner = snap.docs[0].data() as Partner;
        partnerId = existingPartner.id;
        partnerSnapshot = {
          name: existingPartner.name,
          ico: existingPartner.ico,
          dic: existingPartner.dic,
          icdph: existingPartner.icdph,
        };
      }
    }
  }
  
  // Parse date
  let entryDate = Timestamp.now();
  if (extractedData.issueDate) {
    const parsed = new Date(extractedData.issueDate);
    if (!isNaN(parsed.getTime())) {
      entryDate = Timestamp.fromDate(parsed);
    }
  }
  
  // Create entry
  const entriesRef = collection(db, "companies", companyId, "entries");
  const newEntryRef = doc(entriesRef);
  
  // Build entry object, excluding undefined values
  const entry: Entry = {
    id: newEntryRef.id,
    type: entryType,
    date: entryDate,
    amount: extractedData.total || 0,
    currency: (extractedData.currency === "USD" || extractedData.currency === "CZK" || extractedData.currency === "GBP" || extractedData.currency === "PLN" || extractedData.currency === "HUF" || extractedData.currency === "CHF") ? extractedData.currency : "EUR",
    category: entryType === "EXPENSE" ? "Služby" : "Tržby za služby",
    description: extractedData.items?.[0]?.description || "Faktura",
    docNumber: extractedData.invoiceNumber || "",
    payment: {
      status: "UNPAID",
      method: "BANK_TRANSFER",
      iban: extractedData.iban || "",
      vs: extractedData.variableSymbol || "",
    },
    deductible: { enabled: true, percent: 100 },
    attachments: [],
    source: "UPLOAD_IMPORT",
    sourceDocId: uploadId,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    createdBy: userId,
  };
  
  // Only add partnerId and partnerSnapshot if they exist
  if (partnerId) {
    entry.partnerId = partnerId;
  }
  if (partnerSnapshot && Object.keys(partnerSnapshot).length > 0) {
    entry.partnerSnapshot = partnerSnapshot;
  }
  
  await setDoc(newEntryRef, entry);
  
  // Auto-create double-entry transaction (MD/D) so it appears in
  // Účtovanie, Denník, Hlavná kniha, Saldokonto, and Banka
  try {
    await createTransactionFromEntry(entry, userId);
  } catch (err) {
    console.error("Auto-accounting failed for extracted entry", newEntryRef.id, err);
  }
  
  // Update upload with entry reference
  const uploadRef = doc(db, "companies", companyId, "uploads", uploadId);
  await updateDoc(uploadRef, {
    entryId: newEntryRef.id,
    status: "PROCESSED",
    updatedAt: Timestamp.now(),
  });
  
  return newEntryRef.id;
}

// ============================================================================
// ICO LOOKUP (using finstat.sk API or RPO)
// ============================================================================

export async function lookupCompanyByICO(ico: string): Promise<Partial<Partner> | null> {
  const cleanICO = ico.replace(/\s/g, "").padStart(8, "0");
  
  const existing = await getPartnerByICO(cleanICO);
  if (existing) {
    return existing;
  }
  
  try {
    const response = await fetch(
      `https://www.finstat.sk/api/detail?ico=${cleanICO}`,
      { headers: { Accept: "application/json" } }
    );
    
    if (response.ok) {
      const data = await response.json();
      if (data && data.Name) {
        return {
          name: data.Name,
          ico: cleanICO,
          dic: data.Dic || "",
          icdph: data.IcDph || "",
          street: data.Street || "",
          city: data.City || "",
          zip: data.ZipCode || "",
          country: "Slovensko",
          address: [data.Street, data.City, data.ZipCode].filter(Boolean).join(", "),
        };
      }
    }
  } catch (e) {
    console.warn("FinStat lookup failed:", e);
  }
  
  try {
    const response = await fetch(
      `https://rpo.statistics.sk/rpo/json/search?ico=${cleanICO}`,
      { headers: { Accept: "application/json" } }
    );
    
    if (response.ok) {
      const data = await response.json();
      if (data?.results?.length > 0) {
        const result = data.results[0];
        return {
          name: result.full_name || result.name || "",
          ico: cleanICO,
          dic: result.dic || "",
          street: result.street || "",
          city: result.municipality || "",
          zip: result.postal_code || "",
          country: "Slovensko",
        };
      }
    }
  } catch (e) {
    console.warn("RPO lookup failed:", e);
  }
  
  return null;
}
