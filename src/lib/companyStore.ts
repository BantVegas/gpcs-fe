// src/lib/companyStore.ts
// Re-export z companyLookup pre spätnu kompatibilitu
export { getCompanyByICO, saveCompany as upsertCompany } from "./companyLookup";
