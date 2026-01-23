// src/pages/Dashboard.tsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Timestamp } from "firebase/firestore";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Building2,
  Calculator,
  PiggyBank,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  BarChart3,
  AlertCircle,
  Shield,
  ChevronRight,
} from "lucide-react";
import { subscribeToEntries, subscribeToSettings } from "@/lib/firebaseServices";
import {
  calculateTaxes,
  calculateMonthlyBreakdown,
  calculateCategoryBreakdown,
  calculateUnpaidSummary,
  formatEUR,
  formatPercent,
  type TaxResult,
  type MonthlyData,
  type CategoryData,
} from "@/lib/taxEngine";
import type { Entry, CompanySettings } from "@/lib/schemas";
import { DEFAULT_COMPANY_SETTINGS } from "@/lib/schemas";
import { calculateQualityScore, type QualityScore } from "@/lib/ruleEngine";

function getCompanyId(): string {
  const stored = localStorage.getItem("gpcs-company-id");
  return stored || "gpcs";
}

export default function Dashboard() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [settings, setSettings] = useState<CompanySettings>(DEFAULT_COMPANY_SETTINGS);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [dividendPercent, setDividendPercent] = useState(100);
  const [loading, setLoading] = useState(true);
  const [qualityScore, setQualityScore] = useState<QualityScore | null>(null);

  useEffect(() => {
    const unsubEntries = subscribeToEntries((e) => {
      setEntries(e);
      setLoading(false);
    });
    const unsubSettings = subscribeToSettings(setSettings);
    
    // Load quality score
    const loadQualityScore = async () => {
      const companyId = getCompanyId();
      const score = await calculateQualityScore(companyId);
      setQualityScore(score);
    };
    loadQualityScore();
    
    return () => {
      unsubEntries();
      unsubSettings();
    };
  }, []);

  const yearEntries = useMemo(() => {
    return entries.filter((e) => {
      const date = e.date instanceof Timestamp ? e.date.toDate() : new Date(e.date);
      return date.getFullYear() === selectedYear;
    });
  }, [entries, selectedYear]);

  const totals = useMemo(() => {
    let totalIncome = 0;
    let totalExpense = 0;
    let deductibleExpenses = 0;

    for (const entry of yearEntries) {
      if (entry.type === "INCOME") {
        totalIncome += entry.amount;
      } else {
        totalExpense += entry.amount;
        if (entry.deductible?.enabled) {
          deductibleExpenses += entry.amount * ((entry.deductible.percent || 100) / 100);
        }
      }
    }

    return { totalIncome, totalExpense, deductibleExpenses };
  }, [yearEntries]);

  const taxResult: TaxResult = useMemo(() => {
    return calculateTaxes({
      totalIncome: totals.totalIncome,
      totalExpense: totals.totalExpense,
      deductibleExpenses: totals.deductibleExpenses,
      settings: settings.tax,
      dividendPayoutPercent: dividendPercent,
    });
  }, [totals, settings.tax, dividendPercent]);

  const monthlyData: MonthlyData[] = useMemo(() => {
    const entriesForCalc = yearEntries.map((e) => ({
      type: e.type,
      date: e.date instanceof Timestamp ? e.date.toDate() : new Date(e.date),
      amount: e.amount,
    }));
    return calculateMonthlyBreakdown(entriesForCalc, selectedYear);
  }, [yearEntries, selectedYear]);

  const categoryData: CategoryData[] = useMemo(() => {
    const expenses = yearEntries
      .filter((e) => e.type === "EXPENSE")
      .map((e) => ({ category: e.category, amount: e.amount }));
    return calculateCategoryBreakdown(expenses).slice(0, 5);
  }, [yearEntries]);

  const unpaidSummary = useMemo(() => {
    const entriesForCalc = yearEntries.map((e) => ({
      type: e.type,
      amount: e.amount,
      paymentStatus: e.payment.status,
    }));
    return calculateUnpaidSummary(entriesForCalc);
  }, [yearEntries]);

  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthlyStats = useMemo(() => {
    const monthEntries = yearEntries.filter((e) => {
      const date = e.date instanceof Timestamp ? e.date.toDate() : new Date(e.date);
      return date.toISOString().slice(0, 7) === currentMonth;
    });
    const inc = monthEntries.filter((e) => e.type === "INCOME").reduce((a, e) => a + e.amount, 0);
    const exp = monthEntries.filter((e) => e.type === "EXPENSE").reduce((a, e) => a + e.amount, 0);
    return { inc, exp, profit: inc - exp, count: monthEntries.length };
  }, [yearEntries, currentMonth]);

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];
  }, []);

  const maxMonthlyValue = useMemo(() => {
    return Math.max(...monthlyData.map((m) => Math.max(m.income, m.expense)), 1);
  }, [monthlyData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 mt-1">Financny prehlad {settings.companyName}</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<TrendingUp className="w-6 h-6 text-emerald-600" />}
          iconBg="bg-emerald-50"
          label="Celkove prijmy"
          value={formatEUR(taxResult.totalIncome)}
          badge={`${yearEntries.filter((e) => e.type === "INCOME").length} zaznamov`}
          badgeColor="text-emerald-600 bg-emerald-50"
        />
        <StatCard
          icon={<TrendingDown className="w-6 h-6 text-rose-600" />}
          iconBg="bg-rose-50"
          label="Celkove vydavky"
          value={formatEUR(taxResult.totalExpense)}
          badge={`${yearEntries.filter((e) => e.type === "EXPENSE").length} zaznamov`}
          badgeColor="text-rose-600 bg-rose-50"
        />
        <StatCard
          icon={<Wallet className="w-6 h-6 text-blue-600" />}
          iconBg="bg-blue-50"
          label="Hruby zisk"
          value={formatEUR(taxResult.profitBeforeTax)}
          valueColor={taxResult.profitBeforeTax >= 0 ? "text-emerald-600" : "text-rose-600"}
        />
        <StatCard
          icon={<PiggyBank className="w-6 h-6 text-violet-600" />}
          iconBg="bg-violet-50"
          label="Cisty zisk po dani"
          value={formatEUR(taxResult.profitAfterTax)}
          valueColor={taxResult.profitAfterTax >= 0 ? "text-emerald-600" : "text-rose-600"}
          badge={taxResult.corporateTaxRateLabel}
          badgeColor="text-violet-600 bg-violet-50"
        />
      </div>

      {/* Quality Score Widget */}
      {qualityScore && (
        <div className="bg-gradient-to-r from-slate-900 to-slate-700 rounded-2xl p-6 text-white">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                <Shield className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Kvalita účtovníctva</h3>
                <p className="text-slate-300 text-sm">Stav vášho účtovníctva</p>
              </div>
            </div>
            <div className="text-right">
              <div className={`text-4xl font-bold ${
                qualityScore.grade === "A" ? "text-emerald-400" :
                qualityScore.grade === "B" ? "text-blue-400" :
                qualityScore.grade === "C" ? "text-amber-400" :
                "text-rose-400"
              }`}>
                {qualityScore.grade}
              </div>
              <div className="text-slate-300 text-sm">{qualityScore.score}/100</div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mt-4">
            <Link to="/doklady" className="bg-white/10 rounded-xl p-3 hover:bg-white/20 transition-colors">
              <div className="text-2xl font-bold">{qualityScore.inboxPending}</div>
              <div className="text-xs text-slate-300">Čakajúce doklady</div>
            </Link>
            <Link to="/doklady" className="bg-white/10 rounded-xl p-3 hover:bg-white/20 transition-colors">
              <div className="text-2xl font-bold">{qualityScore.lowConfidenceDocs}</div>
              <div className="text-xs text-slate-300">Nízka istota</div>
            </Link>
            <Link to="/uctovnictvo/banka" className="bg-white/10 rounded-xl p-3 hover:bg-white/20 transition-colors">
              <div className="text-2xl font-bold">{qualityScore.unpairedBankMovements}</div>
              <div className="text-xs text-slate-300">Nepárované</div>
            </Link>
            <Link to="/uctovnictvo/saldokonto" className="bg-white/10 rounded-xl p-3 hover:bg-white/20 transition-colors">
              <div className="text-2xl font-bold">{qualityScore.open311Items + qualityScore.open321Items}</div>
              <div className="text-xs text-slate-300">Otvorené 311/321</div>
            </Link>
            <Link to="/uctovnictvo/uzavierky" className="bg-white/10 rounded-xl p-3 hover:bg-white/20 transition-colors">
              <div className="text-2xl font-bold">{qualityScore.lockedMonths}/{qualityScore.totalMonths}</div>
              <div className="text-xs text-slate-300">Zamknuté</div>
            </Link>
          </div>
          
          {(qualityScore.inboxPending > 0 || qualityScore.open311Items + qualityScore.open321Items > 0) && (
            <div className="mt-4 flex gap-2">
              {qualityScore.inboxPending > 0 && (
                <Link
                  to="/doklady"
                  className="flex items-center gap-1 px-3 py-1.5 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600"
                >
                  Spracovať Inbox
                  <ChevronRight size={14} />
                </Link>
              )}
              {qualityScore.open311Items + qualityScore.open321Items > 0 && (
                <Link
                  to="/uctovnictvo/saldokonto"
                  className="flex items-center gap-1 px-3 py-1.5 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600"
                >
                  Skontrolovať saldokonto
                  <ChevronRight size={14} />
                </Link>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                <Calculator className="w-5 h-5 text-slate-700" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Danovy vypocet {selectedYear}</h3>
                <p className="text-sm text-slate-500">DPPO + Dividendy</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h4 className="font-medium text-slate-700 flex items-center gap-2">
                <Building2 size={16} /> Firma
              </h4>
              <div className="space-y-3 text-sm">
                <TaxRow label="Prijmy" value={formatEUR(taxResult.totalIncome)} />
                <TaxRow label="Vydavky" value={formatEUR(taxResult.totalExpense)} />
                <TaxRow label="Odpocitatelne vydavky" value={formatEUR(taxResult.deductibleExpenses)} />
                <div className="h-px bg-slate-100" />
                <TaxRow label="Zaklad dane" value={formatEUR(taxResult.taxBase)} bold />
                <TaxRow label={`DPPO (${taxResult.corporateTaxRateLabel})`} value={formatEUR(taxResult.corporateTax)} valueColor="text-amber-600" />
                <div className="h-px bg-slate-100" />
                <TaxRow label="Zisk po zdaneni" value={formatEUR(taxResult.profitAfterTax)} bold valueColor="text-emerald-600" />
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-medium text-slate-700 flex items-center gap-2">
                <PiggyBank size={16} /> Dividendy
              </h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-slate-500 mb-2">
                    Vyplatit dividend: {dividendPercent}%
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={dividendPercent}
                    onChange={(e) => setDividendPercent(Number(e.target.value))}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900"
                  />
                </div>
                <div className="space-y-3 text-sm pt-2">
                  <TaxRow label="Dividenda (brutto)" value={formatEUR(taxResult.dividendPayout)} />
                  <TaxRow label="Zrazka dane 7%" value={formatEUR(taxResult.dividendTax)} valueColor="text-amber-600" />
                  <div className="h-px bg-slate-100" />
                  <TaxRow label="Dividenda (netto)" value={formatEUR(taxResult.netDividend)} bold valueColor="text-emerald-600" />
                  <TaxRow label="Zostatok vo firme" value={formatEUR(taxResult.retainedEarnings)} />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-sm">
            <span className="text-slate-500">Efektivna danova sadzba</span>
            <span className="font-bold text-lg">{formatPercent(taxResult.effectiveTaxRate)}</span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Clock className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Tento mesiac</h3>
                <p className="text-xs text-slate-500">{monthlyStats.count} transakcii</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 bg-emerald-50 rounded-xl">
                <ArrowUpRight className="w-4 h-4 text-emerald-600 mx-auto mb-1" />
                <p className="text-xs text-slate-500">Prijmy</p>
                <p className="font-bold text-emerald-600">{formatEUR(monthlyStats.inc)}</p>
              </div>
              <div className="text-center p-3 bg-rose-50 rounded-xl">
                <ArrowDownRight className="w-4 h-4 text-rose-600 mx-auto mb-1" />
                <p className="text-xs text-slate-500">Vydavky</p>
                <p className="font-bold text-rose-600">{formatEUR(monthlyStats.exp)}</p>
              </div>
              <div className="text-center p-3 bg-blue-50 rounded-xl">
                <Wallet className="w-4 h-4 text-blue-600 mx-auto mb-1" />
                <p className="text-xs text-slate-500">Zisk</p>
                <p className={`font-bold ${monthlyStats.profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {formatEUR(monthlyStats.profit)}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">Neuhradene</h3>
              </div>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Neuhradene prijmy</span>
                <span className="font-medium text-emerald-600">
                  {formatEUR(unpaidSummary.totalUnpaidIncome)}
                  <span className="text-slate-400 ml-1">({unpaidSummary.unpaidIncomeCount})</span>
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Neuhradene vydavky</span>
                <span className="font-medium text-rose-600">
                  {formatEUR(unpaidSummary.totalUnpaidExpense)}
                  <span className="text-slate-400 ml-1">({unpaidSummary.unpaidExpenseCount})</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-slate-700" />
            </div>
            <h3 className="font-semibold text-slate-900">Mesacny trend</h3>
          </div>
          <div className="space-y-3">
            {monthlyData.map((m) => (
              <div key={m.month} className="flex items-center gap-3">
                <span className="text-xs text-slate-500 w-12">
                  {new Date(m.month + "-01").toLocaleDateString("sk-SK", { month: "short" })}
                </span>
                <div className="flex-1 flex gap-1 h-6">
                  <div
                    className="bg-emerald-500 rounded-sm"
                    style={{ width: `${(m.income / maxMonthlyValue) * 50}%` }}
                    title={`Prijmy: ${formatEUR(m.income)}`}
                  />
                  <div
                    className="bg-rose-500 rounded-sm"
                    style={{ width: `${(m.expense / maxMonthlyValue) * 50}%` }}
                    title={`Vydavky: ${formatEUR(m.expense)}`}
                  />
                </div>
                <span className={`text-xs font-medium w-20 text-right ${m.profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {formatEUR(m.profit)}
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-slate-100 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-500 rounded-sm" /> Prijmy</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-rose-500 rounded-sm" /> Vydavky</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-slate-700" />
            </div>
            <h3 className="font-semibold text-slate-900">Top kategorie vydavkov</h3>
          </div>
          <div className="space-y-4">
            {categoryData.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8">Ziadne vydavky</p>
            ) : (
              categoryData.map((c) => (
                <div key={c.category}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-700">{c.category}</span>
                    <span className="font-medium">{formatEUR(c.amount)}</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-rose-500 to-rose-400 rounded-full"
                      style={{ width: `${c.percent}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  iconBg,
  label,
  value,
  valueColor = "text-slate-900",
  badge,
  badgeColor = "text-slate-600 bg-slate-100",
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  valueColor?: string;
  badge?: string;
  badgeColor?: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
      <div className="flex items-center justify-between mb-4">
        <div className={`w-12 h-12 rounded-xl ${iconBg} flex items-center justify-center`}>
          {icon}
        </div>
        {badge && (
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${badgeColor}`}>
            {badge}
          </span>
        )}
      </div>
      <p className="text-sm text-slate-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${valueColor}`}>{value}</p>
    </div>
  );
}

function TaxRow({
  label,
  value,
  bold = false,
  valueColor = "text-slate-900",
}: {
  label: string;
  value: string;
  bold?: boolean;
  valueColor?: string;
}) {
  return (
    <div className="flex justify-between">
      <span className={`text-slate-500 ${bold ? "font-medium" : ""}`}>{label}</span>
      <span className={`${bold ? "font-bold" : "font-medium"} ${valueColor}`}>{value}</span>
    </div>
  );
}
