// src/lib/companyStore.ts
import { db } from "@/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import type { Company } from "@/lib/types";

const COL = "companies";

function normICO(ico: string) {
  return (ico || "").replace(/\s+/g, "");
}

export async function getCompanyByICO(ico: string): Promise<Company | null> {
  const id = normICO(ico);
  if (!id) return null;
  const ref = doc(db, COL, id);
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as Company) : null;
}

export async function upsertCompany(company: Company): Promise<void> {
  const id = normICO(company.ico);
  if (!id) throw new Error("ICO missing");
  const ref = doc(db, COL, id);
  await setDoc(ref, { ...company, ico: id }, { merge: true });
}
