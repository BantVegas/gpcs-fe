// src/pages/TaxCalculator.tsx
import { useState, useMemo } from "react";
import { calculateTax, formatEUR, TAX_RATES_2025, calculateEmployerCost } from "@/lib/taxCalculations";
import {
  Calculator,
  TrendingUp,
  TrendingDown,
  Wallet,
  PiggyBank,
  Info,
  Building2,
  Users,
  Receipt,
} from "lucide-react";

export default function TaxCalculator() {
  const [income, setIncome] = useState<string>("50000");
  const [expenses, setExpenses] = useState<string>("20000");
  const [executiveSalary, setExecutiveSalary] = useState<string>("816");
  const [isVatPayer, setIsVatPayer] = useState(false);

  const parseNum = (v: string) => {
    const n = Number(v.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };

  const taxResult = useMemo(() => {
    return calculateTax({
      totalIncome: parseNum(income),
      totalExpenses: parseNum(expenses),
      annualTurnover: parseNum(income),
      executiveGrossSalary: parseNum(executiveSalary),
      isVatPayer,
    });
  }, [income, expenses, executiveSalary, isVatPayer]);

  const employerCost = useMemo(() => {
    return calculateEmployerCost(parseNum(executiveSalary));
  }, [executiveSalary]);

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Daňová kalkulačka</h1>
        <p className="text-slate-500 mt-1">Výpočet dane z príjmov právnických osôb podľa zákonov SR 2025</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Input Form */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Calculator className="w-5 h-5 text-slate-600" />
              Vstupné údaje
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Celkové príjmy (EUR)
                </label>
                <div className="relative">
                  <TrendingUp className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-500" />
                  <input
                    type="text"
                    value={income}
                    onChange={(e) => setIncome(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none text-lg font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Celkové výdavky (EUR)
                </label>
                <div className="relative">
                  <TrendingDown className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-rose-500" />
                  <input
                    type="text"
                    value={expenses}
                    onChange={(e) => setExpenses(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 outline-none text-lg font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Hrubá mzda konateľa (EUR/mesiac)
                </label>
                <div className="relative">
                  <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-500" />
                  <input
                    type="text"
                    value={executiveSalary}
                    onChange={(e) => setExecutiveSalary(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-lg font-medium"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Min. mzda 2025: {formatEUR(TAX_RATES_2025.MIN_WAGE)}
                </p>
              </div>

              <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl">
                <input
                  type="checkbox"
                  id="vatPayer"
                  checked={isVatPayer}
                  onChange={(e) => setIsVatPayer(e.target.checked)}
                  className="w-5 h-5 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                />
                <label htmlFor="vatPayer" className="text-sm font-medium text-slate-700">
                  Som platiteľ DPH
                </label>
              </div>
            </div>
          </div>

          {/* Tax Rates Info */}
          <div className="bg-amber-50 rounded-2xl p-6 border border-amber-100">
            <h3 className="font-semibold text-amber-900 mb-3 flex items-center gap-2">
              <Info className="w-5 h-5" />
              Sadzby dane z príjmov PO 2025
            </h3>
            <div className="space-y-2 text-sm text-amber-800">
              <div className="flex justify-between">
                <span>Do {formatEUR(TAX_RATES_2025.SMALL_THRESHOLD)}</span>
                <span className="font-semibold">15%</span>
              </div>
              <div className="flex justify-between">
                <span>Do {formatEUR(TAX_RATES_2025.MICRO_THRESHOLD)} (mikrodaňovník)</span>
                <span className="font-semibold">10%</span>
              </div>
              <div className="flex justify-between">
                <span>Nad {formatEUR(TAX_RATES_2025.MICRO_THRESHOLD)}</span>
                <span className="font-semibold">21%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="lg:col-span-2 space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                  <Wallet className="w-5 h-5 text-emerald-600" />
                </div>
                <span className="text-sm text-slate-500">Hrubý zisk</span>
              </div>
              <p className={`text-3xl font-bold ${taxResult.grossProfit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {formatEUR(taxResult.grossProfit)}
              </p>
            </div>

            <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 shadow-lg">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                  <PiggyBank className="w-5 h-5 text-white" />
                </div>
                <span className="text-sm text-slate-400">Čistý zisk po zdanení</span>
              </div>
              <p className="text-3xl font-bold text-white">{formatEUR(taxResult.netProfit)}</p>
            </div>
          </div>

          {/* Detailed Breakdown */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-slate-600" />
              Podrobný výpočet
            </h2>

            <div className="space-y-4">
              {/* Income & Expenses */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-xl">
                <div>
                  <p className="text-sm text-slate-500">Príjmy</p>
                  <p className="text-xl font-semibold text-emerald-600">{formatEUR(parseNum(income))}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Výdavky</p>
                  <p className="text-xl font-semibold text-rose-600">{formatEUR(parseNum(expenses))}</p>
                </div>
              </div>

              {/* Profit calculation */}
              <div className="space-y-3">
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-600">Hrubý zisk (príjmy - výdavky)</span>
                  <span className="font-semibold">{formatEUR(taxResult.grossProfit)}</span>
                </div>

                {parseNum(executiveSalary) > 0 && (
                  <>
                    <div className="flex justify-between py-2 border-b border-slate-100">
                      <span className="text-slate-600">Náklad na konateľa (ročne)</span>
                      <span className="font-semibold text-rose-600">- {formatEUR(taxResult.executiveCost * 12)}</span>
                    </div>
                    <div className="ml-4 p-3 bg-blue-50 rounded-lg text-sm">
                      <p className="font-medium text-blue-900 mb-2">Rozpis mesačného nákladu:</p>
                      <div className="space-y-1 text-blue-800">
                        <div className="flex justify-between">
                          <span>Hrubá mzda</span>
                          <span>{formatEUR(employerCost.grossSalary)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Zdravotné poistenie (10%)</span>
                          <span>{formatEUR(employerCost.employerHealth)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Sociálne poistenie (35.2%)</span>
                          <span>{formatEUR(employerCost.employerSocial)}</span>
                        </div>
                        <div className="flex justify-between font-semibold pt-1 border-t border-blue-200">
                          <span>Celkový náklad/mesiac</span>
                          <span>{formatEUR(employerCost.totalCost)}</span>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-600">Zisk po odpočítaní nákladov</span>
                  <span className="font-semibold">{formatEUR(taxResult.profitAfterExecutive)}</span>
                </div>

                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-600">Základ dane</span>
                  <span className="font-semibold">{formatEUR(taxResult.taxBase)}</span>
                </div>

                <div className="flex justify-between py-2 border-b border-slate-100 bg-amber-50 -mx-4 px-4 rounded-lg">
                  <div>
                    <span className="text-slate-700 font-medium">Sadzba dane</span>
                    <p className="text-xs text-slate-500">{taxResult.taxRatePercent}</p>
                  </div>
                  <span className="font-bold text-amber-600">{Math.round(taxResult.taxRate * 100)}%</span>
                </div>

                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-700 font-medium">Daň z príjmov</span>
                  <span className="font-bold text-amber-600">{formatEUR(taxResult.incomeTax)}</span>
                </div>

                <div className="flex justify-between py-3 bg-emerald-50 -mx-4 px-4 rounded-lg">
                  <span className="text-emerald-900 font-semibold">Čistý zisk po zdanení</span>
                  <span className="text-2xl font-bold text-emerald-600">{formatEUR(taxResult.netProfit)}</span>
                </div>

                <div className="flex justify-between py-2 text-sm text-slate-500">
                  <span>Efektívna daňová sadzba</span>
                  <span>{taxResult.effectiveTaxRate.toFixed(2)}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Additional Info */}
          <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200">
            <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Dôležité informácie
            </h3>
            <ul className="space-y-2 text-sm text-slate-600">
              <li>• Výpočet je orientačný a nezahŕňa všetky možné odpočty a úľavy</li>
              <li>• Mikrodaňovník: obrat do {formatEUR(TAX_RATES_2025.MICRO_THRESHOLD)}, nie je v likvidácii, nie je platiteľ DPH</li>
              <li>• Hranica pre povinnú registráciu DPH: {formatEUR(TAX_RATES_2025.VAT_REGISTRATION_THRESHOLD)} za 12 mesiacov</li>
              <li>• Sadzby DPH od 2025: {TAX_RATES_2025.VAT_STANDARD * 100}% (štandardná), {TAX_RATES_2025.VAT_REDUCED * 100}% (znížená)</li>
              <li>• Pre presný výpočet odporúčame konzultáciu s daňovým poradcom</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
