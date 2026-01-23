// src/lib/companyLookup.ts
import { db, app } from "@/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import type { Company } from "./types";

/**
 * Vyhľadanie firmy podľa IČO cez Cloud Function
 */
export async function getCompanyByICO(ico: string): Promise<Company | null> {
  const cleanICO = ico.replace(/\s/g, "").padStart(8, "0");
  
  // 1) Najprv skúsime cache vo Firestore
  try {
    const ref = doc(db, "companies", cleanICO);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return snap.data() as Company;
    }
  } catch (e) {
    console.warn("Firestore cache lookup failed:", e);
  }

  // 2) Zavolame Cloud Function pre lookup z registrov
  try {
    const functions = getFunctions(app, "europe-west1");
    const lookupFn = httpsCallable<
      { ico: string },
      { success: boolean; data?: Company; message?: string; source?: string }
    >(functions, "lookupICO");
    
    const result = await lookupFn({ ico: cleanICO });
    
    if (result.data.success && result.data.data) {
      console.log(`ICO ${cleanICO} found via ${result.data.source}`);
      return result.data.data as Company;
    }
  } catch (e) {
    console.warn("Cloud Function lookup failed:", e);
  }

  return null;
}

/**
 * Uloženie firmy do databázy
 */
export async function saveCompany(company: Company): Promise<void> {
  const cleanICO = company.ico.replace(/\s/g, "").padStart(8, "0");
  await setDoc(doc(db, "companies", cleanICO), { ...company, ico: cleanICO }, { merge: true });
}


