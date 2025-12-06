// src/lib/taxCalculations.ts
// Daňové výpočty podľa zákonov SR platných pre rok 2025

/**
 * Sadzby dane z príjmov právnických osôb (DPPO) pre rok 2025
 * Zákon č. 595/2003 Z.z. o dani z príjmov
 */
export const TAX_RATES_2025 = {
  // Daň z príjmov právnických osôb
  CIT_MICRO: 0.10,      // 10% pre mikrodaňovníkov (obrat do 60 000 EUR)
  CIT_SMALL: 0.15,      // 15% pre malé firmy (obrat do 49 790 EUR - hranica pre 15%)
  CIT_STANDARD: 0.21,   // 21% štandardná sadzba
  
  // Hranice obratu
  MICRO_THRESHOLD: 60000,    // Hranica pre mikrodaňovníka
  SMALL_THRESHOLD: 49790,    // Hranica pre 15% sadzbu
  
  // Odvody zamestnávateľa
  EMPLOYER_HEALTH: 0.10,     // 10% zdravotné poistenie
  EMPLOYER_SOCIAL: 0.352,    // 35.2% sociálne poistenie (celkové)
  
  // Odvody zamestnanca
  EMPLOYEE_HEALTH: 0.04,     // 4% zdravotné poistenie
  EMPLOYEE_SOCIAL: 0.094,    // 9.4% sociálne poistenie
  
  // Nezdaniteľná časť základu dane (NČZD) pre rok 2025
  NCZD_BASE: 5646.48,        // Základná NČZD (21-násobok životného minima)
  
  // Minimálna mzda 2025
  MIN_WAGE: 816,             // Minimálna mesačná mzda
  
  // DPH sadzby
  VAT_STANDARD: 0.23,        // 23% štandardná sadzba DPH (od 2025)
  VAT_REDUCED: 0.19,         // 19% znížená sadzba
  VAT_REDUCED_2: 0.05,       // 5% druhá znížená sadzba
  
  // Hranica pre registráciu DPH
  VAT_REGISTRATION_THRESHOLD: 49790, // Obrat za 12 mesiacov
};

export interface TaxCalculationResult {
  grossProfit: number;           // Hrubý zisk (príjmy - výdavky)
  executiveCost: number;         // Náklad na konateľa (ak je)
  profitAfterExecutive: number;  // Zisk po odpočítaní nákladu konateľa
  taxBase: number;               // Základ dane
  taxRate: number;               // Použitá sadzba dane
  taxRatePercent: string;        // Sadzba v %
  incomeTax: number;             // Daň z príjmov
  netProfit: number;             // Čistý zisk po zdanení
  effectiveTaxRate: number;      // Efektívna daňová sadzba
  isMicroTaxpayer: boolean;      // Je mikrodaňovník
  isVatPayer: boolean;           // Je platiteľ DPH
}

export interface TaxInputs {
  totalIncome: number;           // Celkové príjmy
  totalExpenses: number;         // Celkové výdavky
  annualTurnover: number;        // Ročný obrat (pre určenie sadzby)
  executiveGrossSalary?: number; // Hrubá mzda konateľa (voliteľné)
  isVatPayer?: boolean;          // Je platiteľ DPH
}

/**
 * Určí sadzbu dane z príjmov PO podľa obratu
 */
export function getCorporateTaxRate(annualTurnover: number): {
  rate: number;
  label: string;
  isMicro: boolean;
} {
  if (annualTurnover <= TAX_RATES_2025.SMALL_THRESHOLD) {
    return {
      rate: TAX_RATES_2025.CIT_SMALL,
      label: "15% (malý podnikateľ)",
      isMicro: false,
    };
  }
  
  if (annualTurnover <= TAX_RATES_2025.MICRO_THRESHOLD) {
    return {
      rate: TAX_RATES_2025.CIT_MICRO,
      label: "10% (mikrodaňovník)",
      isMicro: true,
    };
  }
  
  return {
    rate: TAX_RATES_2025.CIT_STANDARD,
    label: "21% (štandardná)",
    isMicro: false,
  };
}

/**
 * Vypočíta celkový náklad zamestnávateľa na zamestnanca
 */
export function calculateEmployerCost(grossSalary: number): {
  grossSalary: number;
  employerHealth: number;
  employerSocial: number;
  totalCost: number;
} {
  const employerHealth = grossSalary * TAX_RATES_2025.EMPLOYER_HEALTH;
  const employerSocial = grossSalary * TAX_RATES_2025.EMPLOYER_SOCIAL;
  
  return {
    grossSalary,
    employerHealth: Math.round(employerHealth * 100) / 100,
    employerSocial: Math.round(employerSocial * 100) / 100,
    totalCost: Math.round((grossSalary + employerHealth + employerSocial) * 100) / 100,
  };
}

/**
 * Hlavný výpočet dane a zisku
 */
export function calculateTax(inputs: TaxInputs): TaxCalculationResult {
  const {
    totalIncome,
    totalExpenses,
    annualTurnover,
    executiveGrossSalary = 0,
    isVatPayer = false,
  } = inputs;
  
  // Hrubý zisk
  const grossProfit = totalIncome - totalExpenses;
  
  // Náklad na konateľa (ak je zadaný)
  let executiveCost = 0;
  if (executiveGrossSalary > 0) {
    const execCalc = calculateEmployerCost(executiveGrossSalary);
    executiveCost = execCalc.totalCost;
  }
  
  // Zisk po odpočítaní nákladu konateľa
  const profitAfterExecutive = grossProfit - executiveCost;
  
  // Základ dane (nemôže byť záporný)
  const taxBase = Math.max(0, profitAfterExecutive);
  
  // Určenie sadzby dane
  const taxRateInfo = getCorporateTaxRate(annualTurnover);
  
  // Výpočet dane
  const incomeTax = Math.round(taxBase * taxRateInfo.rate * 100) / 100;
  
  // Čistý zisk
  const netProfit = Math.round((profitAfterExecutive - incomeTax) * 100) / 100;
  
  // Efektívna daňová sadzba
  const effectiveTaxRate = grossProfit > 0 
    ? Math.round((incomeTax / grossProfit) * 10000) / 100 
    : 0;
  
  return {
    grossProfit: Math.round(grossProfit * 100) / 100,
    executiveCost,
    profitAfterExecutive: Math.round(profitAfterExecutive * 100) / 100,
    taxBase,
    taxRate: taxRateInfo.rate,
    taxRatePercent: taxRateInfo.label,
    incomeTax,
    netProfit,
    effectiveTaxRate,
    isMicroTaxpayer: taxRateInfo.isMicro,
    isVatPayer,
  };
}

/**
 * Formátovanie sumy v EUR
 */
export function formatEUR(amount: number): string {
  return new Intl.NumberFormat("sk-SK", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

/**
 * Formátovanie percenta
 */
export function formatPercent(value: number): string {
  return `${value.toFixed(2)} %`;
}
