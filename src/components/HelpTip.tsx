// src/components/HelpTip.tsx
// Reusable component for contextual help and explanations

import { useState } from "react";
import { Link } from "react-router-dom";
import { HelpCircle, X, ExternalLink, AlertTriangle, Info, CheckCircle } from "lucide-react";

interface HelpTipProps {
  title: string;
  text: string;
  linkToGuide?: string;
  linkLabel?: string;
  variant?: "info" | "warning" | "success";
  inline?: boolean;
}

export function HelpTip({ 
  title, 
  text, 
  linkToGuide, 
  linkLabel = "Viac info",
  variant = "info",
  inline = false 
}: HelpTipProps) {
  const [isOpen, setIsOpen] = useState(false);

  const variantStyles = {
    info: {
      bg: "bg-blue-50",
      border: "border-blue-200",
      icon: <Info size={16} className="text-blue-500" />,
      title: "text-blue-900",
      text: "text-blue-700",
    },
    warning: {
      bg: "bg-amber-50",
      border: "border-amber-200",
      icon: <AlertTriangle size={16} className="text-amber-500" />,
      title: "text-amber-900",
      text: "text-amber-700",
    },
    success: {
      bg: "bg-emerald-50",
      border: "border-emerald-200",
      icon: <CheckCircle size={16} className="text-emerald-500" />,
      title: "text-emerald-900",
      text: "text-emerald-700",
    },
  };

  const styles = variantStyles[variant];

  if (inline) {
    return (
      <div className={`${styles.bg} ${styles.border} border rounded-lg p-3 text-sm`}>
        <div className="flex items-start gap-2">
          {styles.icon}
          <div className="flex-1">
            <div className={`font-medium ${styles.title}`}>{title}</div>
            <div className={`mt-0.5 ${styles.text}`}>{text}</div>
            {linkToGuide && (
              <Link 
                to={linkToGuide} 
                className="inline-flex items-center gap-1 mt-2 text-sm font-medium text-blue-600 hover:text-blue-800"
              >
                {linkLabel}
                <ExternalLink size={12} />
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
        title={title}
      >
        <HelpCircle size={16} />
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)} 
          />
          <div className={`absolute z-50 w-72 ${styles.bg} ${styles.border} border rounded-xl shadow-lg p-4 text-sm right-0 top-full mt-1`}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                {styles.icon}
                <span className={`font-semibold ${styles.title}`}>{title}</span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-0.5 hover:bg-white/50 rounded"
              >
                <X size={14} />
              </button>
            </div>
            <p className={`${styles.text} leading-relaxed`}>{text}</p>
            {linkToGuide && (
              <Link 
                to={linkToGuide}
                onClick={() => setIsOpen(false)}
                className="inline-flex items-center gap-1 mt-3 text-sm font-medium text-blue-600 hover:text-blue-800"
              >
                {linkLabel}
                <ExternalLink size={12} />
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// VALIDATION RESULT MODAL
// ============================================================================

import type { RuleHit, RuleResult } from "@/lib/ruleEngine";

interface ValidationModalProps {
  result: RuleResult;
  onClose: () => void;
  onProceed?: () => void; // Only shown if no blocks
  proceedLabel?: string;
}

export function ValidationModal({ 
  result, 
  onClose, 
  onProceed,
  proceedLabel = "Pokračovať napriek upozorneniam"
}: ValidationModalProps) {
  const hasBlocks = result.blocks.length > 0;
  const hasWarnings = result.warnings.length > 0;
  const hasInfos = result.infos.length > 0;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div 
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`px-6 py-4 ${hasBlocks ? "bg-rose-50" : hasWarnings ? "bg-amber-50" : "bg-blue-50"}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {hasBlocks ? (
                <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center">
                  <X size={24} className="text-rose-600" />
                </div>
              ) : hasWarnings ? (
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                  <AlertTriangle size={24} className="text-amber-600" />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <Info size={24} className="text-blue-600" />
                </div>
              )}
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {hasBlocks ? "Nedá sa uložiť" : hasWarnings ? "Upozornenia" : "Informácie"}
                </h2>
                <p className="text-sm text-slate-600">
                  {hasBlocks 
                    ? "Opravte nasledujúce chyby pred uložením" 
                    : hasWarnings 
                    ? "Skontrolujte nasledujúce upozornenia"
                    : "Tipy pre lepšie účtovníctvo"}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/50 rounded-lg">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4 max-h-96 overflow-y-auto space-y-4">
          {/* Blocks */}
          {hasBlocks && (
            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase text-rose-600">Chyby ({result.blocks.length})</div>
              {result.blocks.map((hit, i) => (
                <RuleHitCard key={i} hit={hit} />
              ))}
            </div>
          )}

          {/* Warnings */}
          {hasWarnings && (
            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase text-amber-600">Upozornenia ({result.warnings.length})</div>
              {result.warnings.map((hit, i) => (
                <RuleHitCard key={i} hit={hit} />
              ))}
            </div>
          )}

          {/* Infos */}
          {hasInfos && (
            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase text-blue-600">Tipy ({result.infos.length})</div>
              {result.infos.map((hit, i) => (
                <RuleHitCard key={i} hit={hit} />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-white"
          >
            {hasBlocks ? "Zavrieť a opraviť" : "Zavrieť"}
          </button>
          {!hasBlocks && onProceed && (
            <button
              onClick={onProceed}
              className="flex-1 px-4 py-2.5 rounded-xl bg-amber-500 text-white font-medium hover:bg-amber-600"
            >
              {proceedLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function RuleHitCard({ hit }: { hit: RuleHit }) {
  const severityStyles = {
    BLOCK: { bg: "bg-rose-50", border: "border-rose-200", icon: <X size={16} className="text-rose-500" /> },
    WARN: { bg: "bg-amber-50", border: "border-amber-200", icon: <AlertTriangle size={16} className="text-amber-500" /> },
    INFO: { bg: "bg-blue-50", border: "border-blue-200", icon: <Info size={16} className="text-blue-500" /> },
  };

  const styles = severityStyles[hit.severity];

  return (
    <div className={`${styles.bg} ${styles.border} border rounded-xl p-3`}>
      <div className="flex items-start gap-2">
        <div className="flex-shrink-0 mt-0.5">{styles.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-slate-900 text-sm">{hit.titleSK}</div>
          <div className="text-slate-600 text-sm mt-0.5">{hit.messageSK}</div>
          <div className="text-slate-500 text-xs mt-2 italic">
            💡 {hit.fixSuggestionSK}
          </div>
          {hit.linkToGuide && (
            <Link 
              to={hit.linkToGuide}
              className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-blue-600 hover:text-blue-800"
            >
              Otvoriť návod
              <ExternalLink size={10} />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// ACCOUNTING EXPLANATION CARDS
// ============================================================================

interface AccountingExplanationProps {
  templateCode: string;
}

const TEMPLATE_EXPLANATIONS: Record<string, {
  title: string;
  whatHappens: string;
  whyThisWay: string;
  commonMistake: string;
  accounts: { code: string; name: string; side: "MD" | "D"; why: string }[];
}> = {
  FA_VYDANA_SLUZBY: {
    title: "Vystavená faktúra za služby",
    whatHappens: "Vzniká vám pohľadávka voči odberateľovi a zároveň tržba za služby.",
    whyThisWay: "Pohľadávka (311) je aktívum - rastie na MD. Tržby (602) sú výnos - rastú na D.",
    commonMistake: "Zabudnutie priradiť partnera k účtu 311 - potom nefunguje saldokonto.",
    accounts: [
      { code: "311", name: "Pohľadávky", side: "MD", why: "Odberateľ vám dlhuje peniaze" },
      { code: "602", name: "Tržby za služby", side: "D", why: "Vznikol vám výnos" },
    ],
  },
  UHRADA_ODBERATEL: {
    title: "Úhrada od odberateľa",
    whatHappens: "Odberateľ zaplatil faktúru - peniaze prídu na účet, pohľadávka zaniká.",
    whyThisWay: "Banka (221) rastie na MD (príjem). Pohľadávka (311) klesá na D (zúčtovanie).",
    commonMistake: "Nespárovanie s konkrétnou faktúrou - zostane otvorená položka v saldokonte.",
    accounts: [
      { code: "221", name: "Banka", side: "MD", why: "Peniaze prišli na účet" },
      { code: "311", name: "Pohľadávky", side: "D", why: "Pohľadávka bola uhradená" },
    ],
  },
  FA_PRIJATA_SLUZBY: {
    title: "Prijatá faktúra za služby",
    whatHappens: "Vzniká vám záväzok voči dodávateľovi a zároveň náklad na služby.",
    whyThisWay: "Náklady (518) rastú na MD. Záväzky (321) rastú na D (dlhujete dodávateľovi).",
    commonMistake: "Použitie účtu 501 (spotreba materiálu) namiesto 518 (služby).",
    accounts: [
      { code: "518", name: "Ostatné služby", side: "MD", why: "Vznikol vám náklad" },
      { code: "321", name: "Záväzky", side: "D", why: "Dlhujete dodávateľovi" },
    ],
  },
  UHRADA_DODAVATEL: {
    title: "Úhrada dodávateľovi",
    whatHappens: "Platíte faktúru dodávateľovi - peniaze odídu z účtu, záväzok zaniká.",
    whyThisWay: "Záväzok (321) klesá na MD (zúčtovanie). Banka (221) klesá na D (výdaj).",
    commonMistake: "Zaplatenie bez zaúčtovanej faktúry - chýba otvorená položka na párovanie.",
    accounts: [
      { code: "321", name: "Záväzky", side: "MD", why: "Záväzok bol uhradený" },
      { code: "221", name: "Banka", side: "D", why: "Peniaze odišli z účtu" },
    ],
  },
  MZDA_NAKLAD: {
    title: "Mzdový náklad",
    whatHappens: "Vzniká náklad na mzdu, odvody zamestnávateľa a záväzky voči zamestnancovi, poisťovniam a daňovému úradu.",
    whyThisWay: "Mzda (521) a odvody (524) sú náklady - MD. Záväzky (331, 336, 342) rastú na D.",
    commonMistake: "Zabudnutie na odvody zamestnávateľa (524) - podhodnotenie nákladov.",
    accounts: [
      { code: "521", name: "Mzdové náklady", side: "MD", why: "Hrubá mzda je náklad" },
      { code: "524", name: "Zákonné poistenie", side: "MD", why: "Odvody zamestnávateľa" },
      { code: "331", name: "Zamestnanci", side: "D", why: "Čistá mzda k výplate" },
      { code: "336", name: "SP a ZP", side: "D", why: "Odvody do poisťovní" },
      { code: "342", name: "Priame dane", side: "D", why: "Preddavok na daň" },
    ],
  },
};

export function AccountingExplanation({ templateCode }: AccountingExplanationProps) {
  const explanation = TEMPLATE_EXPLANATIONS[templateCode];
  
  if (!explanation) return null;

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
      <h4 className="font-semibold text-blue-900 mb-2">{explanation.title}</h4>
      
      <div className="space-y-3 text-sm">
        <div>
          <div className="font-medium text-slate-700">📋 Čo sa deje:</div>
          <div className="text-slate-600">{explanation.whatHappens}</div>
        </div>
        
        <div>
          <div className="font-medium text-slate-700">🎯 Prečo takto:</div>
          <div className="text-slate-600">{explanation.whyThisWay}</div>
        </div>
        
        <div>
          <div className="font-medium text-slate-700">⚠️ Najčastejšia chyba:</div>
          <div className="text-amber-700">{explanation.commonMistake}</div>
        </div>
        
        <div className="mt-3 pt-3 border-t border-blue-200">
          <div className="font-medium text-slate-700 mb-2">Účtovanie:</div>
          <div className="grid grid-cols-2 gap-2">
            {explanation.accounts.map((acc) => (
              <div 
                key={acc.code}
                className={`p-2 rounded-lg text-xs ${
                  acc.side === "MD" ? "bg-blue-100" : "bg-emerald-100"
                }`}
              >
                <div className="font-mono font-bold">
                  {acc.side} {acc.code}
                </div>
                <div className="text-slate-600">{acc.name}</div>
                <div className="text-slate-500 mt-1">{acc.why}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
