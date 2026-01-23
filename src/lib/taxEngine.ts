// src/lib/taxEngine.ts
// Professional Tax Engine for GPCS Ucto - DPPO + Dividends calculations

import type { TaxSettings } from "./schemas";
import { DEFAULT_TAX_SETTINGS } from "./schemas";

// ============================================================================
// TYPES
// ============================================================================

export interface TaxInput {
  totalIncome: number;
  totalExpense: number;
  deductibleExpenses: number;
  settings: TaxSettings;
  dividendPayoutPercent?: number;
}

export interface TaxResult {
  totalIncome: number;
  totalExpense: number;
  profitBeforeTax: number;
  deductibleExpenses: number;
  taxBase: number;
  corporateTaxRate: number;
  corporateTaxRateLabel: string;
  corporateTax: number;
  profitAfterTax: number;
  dividendPayout: number;
  dividendTax: number;
  netDividend: number;
  retainedEarnings: number;
  effectiveTaxRate: number;
}

// ============================================================================
// TAX RATE DETERMINATION
// ============================================================================

export function getCorporateTaxRate(
  totalIncome: number,
  settings: TaxSettings
): { rate: number; label: string } {
  if (settings.corporateTaxMode === "FIXED") {
    const pct = Math.round(settings.corporateTaxFixedRate * 100);
    return {
      rate: settings.corporateTaxFixedRate,
      label: `${pct}% (fixná sadzba)`,
    };
  }

  const brackets = settings.corporateBrackets;
  for (const bracket of brackets) {
    if (bracket.upToRevenue === null || totalIncome <= bracket.upToRevenue) {
      const pct = Math.round(bracket.rate * 100);
      if (bracket.upToRevenue === null) {
        return { rate: bracket.rate, label: `${pct}% (nad 5M EUR)` };
      } else if (bracket.upToRevenue <= 100000) {
        return { rate: bracket.rate, label: `${pct}% (do 100k EUR)` };
      } else {
        return { rate: bracket.rate, label: `${pct}% (do ${(bracket.upToRevenue / 1000000).toFixed(0)}M EUR)` };
      }
    }
  }

  return { rate: 0.21, label: "21% (štandardná)" };
}

// ============================================================================
// MAIN CALCULATION
// ============================================================================

export function calculateTaxes(input: TaxInput): TaxResult {
  const {
    totalIncome,
    totalExpense,
    deductibleExpenses,
    settings,
    dividendPayoutPercent = 100,
  } = input;

  const profitBeforeTax = totalIncome - totalExpense;
  
  const lossCarryforward = settings.lossCarryforward || 0;
  const taxBase = Math.max(0, totalIncome - deductibleExpenses - lossCarryforward);
  
  const { rate: corporateTaxRate, label: corporateTaxRateLabel } = getCorporateTaxRate(
    totalIncome,
    settings
  );
  
  const corporateTax = round2(taxBase * corporateTaxRate);
  const profitAfterTax = round2(profitBeforeTax - corporateTax);
  
  const maxDividend = Math.max(0, profitAfterTax);
  const dividendPayout = round2(maxDividend * (dividendPayoutPercent / 100));
  
  const dividendTax = round2(dividendPayout * settings.dividendWithholdingRate);
  const netDividend = round2(dividendPayout - dividendTax);
  
  const retainedEarnings = round2(profitAfterTax - dividendPayout);
  
  const effectiveTaxRate = profitBeforeTax > 0
    ? round2(((corporateTax + dividendTax) / profitBeforeTax) * 100)
    : 0;

  return {
    totalIncome,
    totalExpense,
    profitBeforeTax: round2(profitBeforeTax),
    deductibleExpenses,
    taxBase,
    corporateTaxRate,
    corporateTaxRateLabel,
    corporateTax,
    profitAfterTax,
    dividendPayout,
    dividendTax,
    netDividend,
    retainedEarnings,
    effectiveTaxRate,
  };
}

// ============================================================================
// MONTHLY BREAKDOWN
// ============================================================================

export interface MonthlyData {
  month: string;
  income: number;
  expense: number;
  profit: number;
}

export function calculateMonthlyBreakdown(
  entries: { type: "INCOME" | "EXPENSE"; date: Date; amount: number }[],
  year: number
): MonthlyData[] {
  const months: MonthlyData[] = [];
  
  for (let m = 0; m < 12; m++) {
    const monthStr = `${year}-${String(m + 1).padStart(2, "0")}`;
    const monthEntries = entries.filter((e) => {
      const d = e.date;
      return d.getFullYear() === year && d.getMonth() === m;
    });
    
    const income = monthEntries
      .filter((e) => e.type === "INCOME")
      .reduce((sum, e) => sum + e.amount, 0);
    const expense = monthEntries
      .filter((e) => e.type === "EXPENSE")
      .reduce((sum, e) => sum + e.amount, 0);
    
    months.push({
      month: monthStr,
      income: round2(income),
      expense: round2(expense),
      profit: round2(income - expense),
    });
  }
  
  return months;
}

// ============================================================================
// CATEGORY BREAKDOWN
// ============================================================================

export interface CategoryData {
  category: string;
  amount: number;
  percent: number;
}

export function calculateCategoryBreakdown(
  entries: { category: string; amount: number }[]
): CategoryData[] {
  const categoryMap = new Map<string, number>();
  let total = 0;
  
  for (const entry of entries) {
    const current = categoryMap.get(entry.category) || 0;
    categoryMap.set(entry.category, current + entry.amount);
    total += entry.amount;
  }
  
  const result: CategoryData[] = [];
  for (const [category, amount] of categoryMap) {
    result.push({
      category,
      amount: round2(amount),
      percent: total > 0 ? round2((amount / total) * 100) : 0,
    });
  }
  
  return result.sort((a, b) => b.amount - a.amount);
}

// ============================================================================
// UNPAID SUMMARY
// ============================================================================

export interface UnpaidSummary {
  totalUnpaidIncome: number;
  totalUnpaidExpense: number;
  unpaidIncomeCount: number;
  unpaidExpenseCount: number;
}

export function calculateUnpaidSummary(
  entries: { type: "INCOME" | "EXPENSE"; amount: number; paymentStatus: "PAID" | "UNPAID" | "PARTIAL" }[]
): UnpaidSummary {
  let totalUnpaidIncome = 0;
  let totalUnpaidExpense = 0;
  let unpaidIncomeCount = 0;
  let unpaidExpenseCount = 0;
  
  for (const entry of entries) {
    if (entry.paymentStatus !== "PAID") {
      if (entry.type === "INCOME") {
        totalUnpaidIncome += entry.amount;
        unpaidIncomeCount++;
      } else {
        totalUnpaidExpense += entry.amount;
        unpaidExpenseCount++;
      }
    }
  }
  
  return {
    totalUnpaidIncome: round2(totalUnpaidIncome),
    totalUnpaidExpense: round2(totalUnpaidExpense),
    unpaidIncomeCount,
    unpaidExpenseCount,
  };
}

// ============================================================================
// UTILITIES
// ============================================================================

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function formatEUR(amount: number): string {
  return new Intl.NumberFormat("sk-SK", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)} %`;
}

export function formatCompact(amount: number): string {
  if (Math.abs(amount) >= 1000000) {
    return `${(amount / 1000000).toFixed(1)}M`;
  }
  if (Math.abs(amount) >= 1000) {
    return `${(amount / 1000).toFixed(1)}k`;
  }
  return amount.toFixed(0);
}

// ============================================================================
// EXPORT DEFAULT SETTINGS FOR CONVENIENCE
// ============================================================================

export { DEFAULT_TAX_SETTINGS };
