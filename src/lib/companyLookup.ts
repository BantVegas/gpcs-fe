// src/lib/companyLookup.ts
import { db } from "@/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import type { Company } from "./types";


/**
 * Vyhľadanie firmy podľa IČO cez slovenské registre
 * Používa ORSR API (Obchodný register SR)
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

  // 2) Skúsime ORSR API (Obchodný register SR)
  try {
    const response = await fetch(
      `https://www.orsr.sk/hladaj_ico.asp?ICO=${cleanICO}&SID=0`,
      { 
        method: "GET",
        headers: { "Accept": "text/html" }
      }
    );
    
    if (response.ok) {
      const html = await response.text();
      const company = parseORSRHtml(html, cleanICO);
      if (company && company.name) {
        // Uložíme do cache
        await setDoc(doc(db, "companies", cleanICO), company, { merge: true });
        return company;
      }
    }
  } catch (e) {
    console.warn("ORSR lookup failed:", e);
  }

  // 3) Alternatívne skúsime FinStat API (ak máte API kľúč)
  try {
    const finstatResult = await lookupFinStat(cleanICO);
    if (finstatResult && finstatResult.name) {
      await setDoc(doc(db, "companies", cleanICO), finstatResult, { merge: true });
      return finstatResult;
    }
  } catch (e) {
    console.warn("FinStat lookup failed:", e);
  }

  // 4) Skúsime RPO (Register právnických osôb)
  try {
    const rpoResult = await lookupRPO(cleanICO);
    if (rpoResult && rpoResult.name) {
      await setDoc(doc(db, "companies", cleanICO), rpoResult, { merge: true });
      return rpoResult;
    }
  } catch (e) {
    console.warn("RPO lookup failed:", e);
  }

  return null;
}

/**
 * Parsovanie HTML odpovede z ORSR
 */
function parseORSRHtml(html: string, ico: string): Company | null {
  try {
    // Jednoduchý regex parsing pre ORSR HTML
    const nameMatch = html.match(/Obchodné meno:.*?<td[^>]*>([^<]+)</i);
    const addressMatch = html.match(/Sídlo:.*?<td[^>]*>([^<]+)</i);
    
    if (nameMatch) {
      const name = nameMatch[1].trim();
      const address = addressMatch ? addressMatch[1].trim() : "";
      
      // Parsovanie adresy
      const parts = address.split(",").map(s => s.trim());
      let street = parts[0] || "";
      let city = "";
      let zip = "";
      
      if (parts.length > 1) {
        const lastPart = parts[parts.length - 1];
        const zipMatch = lastPart.match(/(\d{3}\s?\d{2})/);
        if (zipMatch) {
          zip = zipMatch[1];
          city = lastPart.replace(zipMatch[0], "").trim();
        } else {
          city = lastPart;
        }
      }
      
      return {
        ico,
        name,
        street,
        city,
        zip,
        country: "Slovensko",
        address,
      };
    }
  } catch (e) {
    console.warn("ORSR HTML parsing failed:", e);
  }
  return null;
}

/**
 * Lookup cez FinStat API
 * Poznámka: Vyžaduje API kľúč pre produkčné použitie
 */
async function lookupFinStat(ico: string): Promise<Company | null> {
  // FinStat má verejné API pre základné údaje
  try {
    const response = await fetch(
      `https://www.finstat.sk/api/detail?ico=${ico}`,
      {
        headers: {
          "Accept": "application/json",
        }
      }
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data || !data.Name) return null;
    
    return {
      ico,
      name: data.Name || "",
      dic: data.Dic || "",
      icdph: data.IcDph || "",
      street: data.Street || "",
      city: data.City || "",
      zip: data.ZipCode || "",
      country: "Slovensko",
      address: [data.Street, data.City, data.ZipCode].filter(Boolean).join(", "),
    };
  } catch {
    return null;
  }
}

/**
 * Lookup cez RPO (Register právnických osôb)
 */
async function lookupRPO(ico: string): Promise<Company | null> {
  try {
    // RPO API endpoint
    const response = await fetch(
      `https://rpo.statistics.sk/rpo/json/search?ico=${ico}`,
      {
        headers: {
          "Accept": "application/json",
        }
      }
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data || !data.results || data.results.length === 0) return null;
    
    const result = data.results[0];
    
    return {
      ico,
      name: result.full_name || result.name || "",
      dic: result.dic || "",
      street: result.street || "",
      city: result.municipality || "",
      zip: result.postal_code || "",
      country: "Slovensko",
    };
  } catch {
    return null;
  }
}

/**
 * Uloženie firmy do databázy
 */
export async function saveCompany(company: Company): Promise<void> {
  const cleanICO = company.ico.replace(/\s/g, "").padStart(8, "0");
  await setDoc(doc(db, "companies", cleanICO), { ...company, ico: cleanICO }, { merge: true });
}


