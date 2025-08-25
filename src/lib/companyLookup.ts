// src/lib/companyLookup.ts
import { db } from "@/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import type { Company } from "./types";

function mapExternalToCompany(j: any): Partial<Company> {
  return {
    name: j.name ?? j.obchodne_meno,
    dic: j.dic ?? j.tax_id,
    icdph: j.icdph ?? j.vat ?? j.ic_dph,
    street: j.street ?? j.adresa_ulica,
    city: j.city ?? j.adresa_mesto,
    zip: j.zip ?? j.psc,
    address: j.address ?? j.adresa,
    country: j.country ?? "Slovensko",
    phone: j.phone,
    email: j.email,
    iban: j.iban,
  };
}

export async function getCompanyByICO(ico: string): Promise<Company | null> {
  // 1) cache vo Firestore
  try {
    const ref = doc(db, "companies", ico);
    const snap = await getDoc(ref);
    if (snap.exists()) return snap.data() as Company;
  } catch {}

  // 2) externý lookup (endpoint si prispôsob, toto je len kostra)
  try {
    const res = await fetch(`https://api.example.invalid/company/${ico}`);
    if (!res.ok) throw new Error("lookup failed");

    const raw = await res.json();        // << tu je tá správna premenná
    const ext = mapExternalToCompany(raw);

    const company: Company = {
      ico,
      name: ext.name ?? "",
      dic: ext.dic,
      icdph: ext.icdph,
      street: ext.street,
      city: ext.city,
      zip: ext.zip,
      country: ext.country ?? "Slovensko",
      address: ext.address,
      phone: ext.phone,
      email: ext.email,
      iban: ext.iban,
    };

    if (company.name) {
      await setDoc(doc(db, "companies", ico), company, { merge: true });
      return company;
    }
  } catch {}

  return null;
}


