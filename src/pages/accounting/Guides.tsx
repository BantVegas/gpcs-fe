// src/pages/accounting/Guides.tsx
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { CheckCircle, Circle, ChevronRight, AlertTriangle, BookOpen, Play, ExternalLink, Lightbulb, XCircle } from "lucide-react";
import { db } from "@/firebase";
import { doc, getDoc, setDoc, Timestamp } from "firebase/firestore";
import { useUser } from "@/components/AuthGate";
import { DEFAULT_GUIDES, type Guide } from "@/lib/accountingSchemas";

function getCompanyId(): string {
  const stored = localStorage.getItem("gpcs-company-id");
  return stored || "gpcs";
}

export default function Guides() {
  useUser(); // Auth check
  const [guides, setGuides] = useState<Guide[]>([]);
  const [selectedGuide, setSelectedGuide] = useState<Guide | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadGuides();
  }, []);

  async function loadGuides() {
    const companyId = getCompanyId();
    const guidesRef = doc(db, "companies", companyId, "settings", "guides");
    const snap = await getDoc(guidesRef);
    
    if (snap.exists()) {
      const data = snap.data();
      setGuides(data.guides || []);
    } else {
      // Initialize with default guides
      const initialGuides = DEFAULT_GUIDES.map((g, i) => ({
        ...g,
        id: `guide-${i + 1}`,
        steps: g.steps.map((s) => ({ ...s, completed: false })),
      }));
      await setDoc(guidesRef, { guides: initialGuides });
      setGuides(initialGuides);
    }
    setLoading(false);
  }

  async function toggleStep(guideId: string, stepId: string) {
    const companyId = getCompanyId();
    const updatedGuides = guides.map((g) => {
      if (g.id !== guideId) return g;
      return {
        ...g,
        steps: g.steps.map((s) => {
          if (s.id !== stepId) return s;
          return {
            ...s,
            completed: !s.completed,
            completedAt: !s.completed ? Timestamp.now() : undefined,
          };
        }),
      };
    });
    
    setGuides(updatedGuides);
    const guidesRef = doc(db, "companies", companyId, "settings", "guides");
    await setDoc(guidesRef, { guides: updatedGuides });
  }

  async function resetGuide(guideId: string) {
    const companyId = getCompanyId();
    const updatedGuides = guides.map((g) => {
      if (g.id !== guideId) return g;
      return {
        ...g,
        steps: g.steps.map((s) => ({ ...s, completed: false, completedAt: undefined })),
      };
    });
    
    setGuides(updatedGuides);
    const guidesRef = doc(db, "companies", companyId, "settings", "guides");
    await setDoc(guidesRef, { guides: updatedGuides });
  }

  const getProgress = (guide: Guide) => {
    const completed = guide.steps.filter((s) => s.completed).length;
    return { completed, total: guide.steps.length, percent: Math.round((completed / guide.steps.length) * 100) };
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case "DAILY": return "Denná";
      case "WEEKLY": return "Týždenná";
      case "MONTHLY": return "Mesačná";
      case "YEARLY": return "Ročná";
      case "SPECIAL": return "Špeciálna";
      default: return category;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "DAILY": return "bg-blue-100 text-blue-700";
      case "WEEKLY": return "bg-purple-100 text-purple-700";
      case "MONTHLY": return "bg-amber-100 text-amber-700";
      case "YEARLY": return "bg-rose-100 text-rose-700";
      case "SPECIAL": return "bg-slate-100 text-slate-700";
      default: return "bg-slate-100 text-slate-700";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Návody</h1>
        <p className="text-slate-500">Praktické postupy pre vedenie účtovníctva</p>
      </div>

      {selectedGuide ? (
        <GuideDetail
          guide={selectedGuide}
          onBack={() => setSelectedGuide(null)}
          onToggleStep={(stepId) => toggleStep(selectedGuide.id, stepId)}
          onReset={() => resetGuide(selectedGuide.id)}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {guides.sort((a, b) => a.order - b.order).map((guide) => {
            const progress = getProgress(guide);
            return (
              <div
                key={guide.id}
                onClick={() => setSelectedGuide(guide)}
                className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 cursor-pointer hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                      <BookOpen size={20} className="text-slate-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900">{guide.title}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${getCategoryColor(guide.category)}`}>
                        {getCategoryLabel(guide.category)}
                      </span>
                    </div>
                  </div>
                  <ChevronRight size={20} className="text-slate-400" />
                </div>
                <p className="text-sm text-slate-600 mb-4">{guide.description}</p>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${progress.percent === 100 ? "bg-emerald-500" : "bg-slate-400"}`}
                      style={{ width: `${progress.percent}%` }}
                    />
                  </div>
                  <span className="text-sm text-slate-500">
                    {progress.completed}/{progress.total}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Extended step info for guided mode
// Rozšírené detaily krokov s podrobnými vysvetleniami
const STEP_DETAILS: Record<string, {
  whatToDo: string;
  detailedSteps: string[];
  why: string;
  whyDetailed: string;
  commonMistake: string;
  howToFix: string;
  accountingContext?: string;
  linkPath?: string;
  linkLabel?: string;
}> = {
  // ============================================================================
  // DENNÁ RUTINA
  // ============================================================================
  "daily-1": {
    whatToDo: "Skontrolujte a spracujte nové doklady v Inboxe",
    detailedSteps: [
      "1. Otvorte sekciu Doklady (Inbox) v ľavom menu",
      "2. Prezrite si zoznam nových uploadnutých súborov",
      "3. Pri každom doklade kliknite na 'Extrahovať' - systém automaticky rozpozná údaje",
      "4. Skontrolujte extrahované údaje (suma, dátum, dodávateľ, číslo faktúry)",
      "5. Ak je všetko správne, kliknite 'Zaúčtovať' - systém vytvorí účtovnú transakciu",
      "6. Ak údaje nie sú správne, opravte ich manuálne pred zaúčtovaním",
    ],
    why: "Každý doklad musí byť zaúčtovaný v správnom účtovnom období.",
    whyDetailed: "Podľa zákona o účtovníctve musí byť každý účtovný prípad zaúčtovaný v období, kedy vznikol. Ak faktúru z januára zaúčtujete až vo februári, môže to skresliť mesačné výsledky a spôsobiť problémy pri kontrole z daňového úradu. Navyše, čím dlhšie doklad leží nespracovaný, tým väčšia šanca, že zabudnete kontext (prečo ste to kupovali, na aký projekt to patrí).",
    commonMistake: "Nechať doklady v Inboxe dlhšie ako týždeň - zabudnete kontext a môžete zaúčtovať do nesprávneho obdobia.",
    howToFix: "Nastavte si dennú rutinu: každé ráno 5 minút na kontrolu Inboxu. Ak nemáte čas spracovať doklad hneď, aspoň si poznačte o čo ide.",
    accountingContext: "Pri zaúčtovaní faktúry od dodávateľa systém vytvorí transakciu: MD 5xx (náklad) / D 321 (záväzok). Pri faktúre pre odberateľa: MD 311 (pohľadávka) / D 6xx (výnos).",
    linkPath: "/doklady",
    linkLabel: "Otvoriť Inbox",
  },
  "daily-2": {
    whatToDo: "Skontrolujte bankový účet a spárujte platby s faktúrami",
    detailedSteps: [
      "1. Otvorte sekciu Banka v menu Účtovníctvo",
      "2. Importujte nový bankový výpis (XML alebo CSV z vášho bankovníctva)",
      "3. Systém zobrazí zoznam nových pohybov na účte",
      "4. Pri každom pohybe kliknite na 'Spárovať'",
      "5. Vyberte faktúru, ku ktorej platba patrí (systém navrhne podľa sumy a VS)",
      "6. Potvrďte párovanie - systém automaticky vytvorí účtovnú transakciu",
    ],
    why: "Párovanie platieb udržiava saldokonto aktuálne.",
    whyDetailed: "Saldokonto je prehľad otvorených pohľadávok (kto vám dlhuje) a záväzkov (komu dlhujete vy). Ak nespárujete platbu s faktúrou, v saldokonte zostane faktúra ako 'nezaplatená', aj keď peniaze už máte na účte. To vedie k nesprávnym upomienkam zákazníkom a zlému prehľadu o cash flow.",
    commonMistake: "Zabudnúť spárovať platbu - v saldokonte zostane otvorená položka, aj keď je faktúra zaplatená.",
    howToFix: "Po každej platbe ihneď spárujte. Ideálne importujte bankový výpis denne a spárujte všetky pohyby naraz.",
    accountingContext: "Pri úhrade od odberateľa: MD 221 (banka) / D 311 (pohľadávka). Pri úhrade dodávateľovi: MD 321 (záväzok) / D 221 (banka). Účet 221 je váš bankový účet.",
    linkPath: "/uctovnictvo/banka",
    linkLabel: "Otvoriť Banku",
  },
  
  // ============================================================================
  // TÝŽDENNÁ RUTINA
  // ============================================================================
  "weekly-1": {
    whatToDo: "Skontrolujte pohľadávky (účet 311) - kto vám dlhuje",
    detailedSteps: [
      "1. Otvorte Saldokonto v menu Účtovníctvo",
      "2. Vyfiltrujte účet 311 (Pohľadávky z obchodného styku)",
      "3. Prezrite si zoznam otvorených položiek",
      "4. Všimnite si faktúry po splatnosti (zvýraznené červeno)",
      "5. Pri faktúrach po splatnosti kontaktujte zákazníka (email, telefón)",
      "6. Ak zákazník zaplatil ale platba nie je spárovaná, spárujte ju v Banke",
    ],
    why: "Včasná kontrola pohľadávok = včasné upomienky = lepšie cash flow.",
    whyDetailed: "Čím dlhšie necháte faktúru nezaplatenú, tým menšia šanca, že ju zákazník zaplatí. Štatistiky ukazujú, že po 90 dňoch po splatnosti klesá šanca na zaplatenie pod 50%. Pravidelná kontrola vám umožní včas reagovať - poslať upomienku, zavolať, prípadne začať vymáhanie.",
    commonMistake: "Ignorovať staré pohľadávky - môžu sa stať nedobytnými a budete musieť odpísať stratu.",
    howToFix: "Každý týždeň prejdite saldokonto 311. Faktúry 7+ dní po splatnosti = upomienka emailom. 30+ dní = telefonát. 60+ dní = formálna upomienka. 90+ dní = zvážte právne kroky.",
    accountingContext: "Účet 311 zachytáva pohľadávky voči odberateľom. MD strana = vznik pohľadávky (vystavili ste faktúru). D strana = zánik pohľadávky (zákazník zaplatil alebo odpis).",
    linkPath: "/uctovnictvo/saldokonto",
    linkLabel: "Otvoriť Saldokonto",
  },
  "weekly-2": {
    whatToDo: "Skontrolujte záväzky (účet 321) - komu dlhujete vy",
    detailedSteps: [
      "1. Otvorte Saldokonto v menu Účtovníctvo",
      "2. Vyfiltrujte účet 321 (Záväzky z obchodného styku)",
      "3. Prezrite si zoznam nezaplatených faktúr od dodávateľov",
      "4. Skontrolujte dátumy splatnosti",
      "5. Naplánujte platby tak, aby ste stihli splatnosť",
      "6. Pri platbe nezabudnite uviesť správny variabilný symbol",
    ],
    why: "Včasné platenie = dobré vzťahy s dodávateľmi a žiadne penále.",
    whyDetailed: "Oneskorené platby môžu viesť k: 1) Penále a úrokom z omeškania (zákonná sadzba je cca 8% ročne). 2) Zhoršeniu vzťahov s dodávateľom - môže vám odmietnuť dodávky alebo zhoršiť podmienky. 3) Negatívnemu záznamu v registri dlžníkov. 4) V extrémnych prípadoch k súdnemu vymáhaniu.",
    commonMistake: "Zabudnúť na splatnosť faktúry - penále, úroky z omeškania, poškodenie reputácie.",
    howToFix: "Každý týždeň skontrolujte splatnosti. Nastavte si pripomienky 3 dni pred splatnosťou. Ak nemáte dosť peňazí, kontaktujte dodávateľa a dohodnite splátkový kalendár.",
    accountingContext: "Účet 321 zachytáva záväzky voči dodávateľom. D strana = vznik záväzku (prijali ste faktúru). MD strana = zánik záväzku (zaplatili ste).",
    linkPath: "/uctovnictvo/saldokonto",
    linkLabel: "Otvoriť Saldokonto",
  },
  
  // ============================================================================
  // MESAČNÁ RUTINA
  // ============================================================================
  "monthly-1": {
    whatToDo: "Spracujte mzdy zamestnancov",
    detailedSteps: [
      "1. Otvorte sekciu Mzdy v menu Účtovníctvo",
      "2. Kliknite na 'Nový mzdový výpočet'",
      "3. Vyberte mesiac a zamestnanca",
      "4. Zadajte hrubú mzdu (alebo použite prednastavenú)",
      "5. Systém automaticky vypočíta odvody (sociálne, zdravotné, daň)",
      "6. Skontrolujte výpočet a potvrďte",
      "7. Systém vytvorí účtovné transakcie pre mzdu aj odvody",
      "8. Nezabudnite vytvoriť príkazy na úhradu (mzda, odvody, daň)",
    ],
    why: "Mzda musí byť vyplatená do určitého dňa v mesiaci.",
    whyDetailed: "Podľa Zákonníka práce musí byť mzda vyplatená najneskôr do konca nasledujúceho mesiaca (ak nie je dohodnuté inak). Odvody do Sociálnej a zdravotnej poisťovne sú splatné do 8. dňa nasledujúceho mesiaca. Preddavok na daň je splatný do 5 dní po výplate. Oneskorené odvody = penále až 0,05% denne!",
    commonMistake: "Zabudnúť na odvody zamestnávateľa (účet 524) - podhodnotíte skutočné náklady na zamestnanca.",
    howToFix: "Použite mzdový wizard, ktorý automaticky vypočíta všetky odvody. Celkové náklady na zamestnanca = hrubá mzda × 1,352 (35,2% odvody zamestnávateľa).",
    accountingContext: "Mzdové účtovanie: MD 521 (mzdové náklady) / D 331 (záväzky voči zamestnancom). Odvody zamestnávateľa: MD 524 / D 336. Zrážky zo mzdy: MD 331 / D 336, 342. Výplata: MD 331 / D 221.",
    linkPath: "/uctovnictvo/mzdy",
    linkLabel: "Otvoriť Mzdy",
  },
  "monthly-2": {
    whatToDo: "Skontrolujte a zaúčtujte všetky doklady za mesiac",
    detailedSteps: [
      "1. Otvorte sekciu Transakcie",
      "2. Vyfiltrujte aktuálny mesiac",
      "3. Skontrolujte, či sú všetky transakcie v stave 'Zaúčtované' (POSTED)",
      "4. Ak máte koncepty (DRAFT), otvorte ich a dokončite",
      "5. Skontrolujte Inbox - nemali by tam byť žiadne nespracované doklady",
      "6. Overte, že súčet MD = súčet D (podvojné účtovníctvo musí byť vyvážené)",
    ],
    why: "Pred uzávierkou musia byť všetky transakcie zaúčtované.",
    whyDetailed: "Mesačná uzávierka 'zamkne' obdobie - po zamknutí už nemôžete pridávať ani upravovať transakcie. Ak zabudnete zaúčtovať nejaký doklad, budete musieť obdobie odomknúť (čo vyžaduje oprávnenie) alebo zaúčtovať do nasledujúceho mesiaca (čo skresľuje výsledky).",
    commonMistake: "Nechať koncepty (DRAFT) - nemožno uzavrieť mesiac a koncepty sa môžu stratiť.",
    howToFix: "Pred uzávierkou vždy prejdite: 1) Inbox = prázdny. 2) Transakcie = žiadne DRAFT. 3) Banka = všetky pohyby spárované.",
    accountingContext: "Každá transakcia musí mať rovnaký súčet na strane MD (Má dať) a D (Dal). Toto je základný princíp podvojného účtovníctva - každý účtovný prípad ovplyvňuje minimálne 2 účty.",
    linkPath: "/uctovnictvo/transakcie",
    linkLabel: "Otvoriť Transakcie",
  },
  "monthly-3": {
    whatToDo: "Vykonajte mesačnú uzávierku a zamknite obdobie",
    detailedSteps: [
      "1. Otvorte sekciu Uzávierky v menu Účtovníctvo",
      "2. Nájdite aktuálny mesiac v zozname",
      "3. Kliknite na 'Uzávierka' - systém skontroluje pripravenosť",
      "4. Ak sú nejaké problémy (koncepty, nespárované platby), opravte ich",
      "5. Exportujte účtovný denník (pre archiváciu)",
      "6. Kliknite na 'Zamknúť obdobie'",
      "7. Po zamknutí už nemožno upravovať transakcie v tomto mesiaci",
    ],
    why: "Zamknutie obdobia zabraňuje neúmyselným zmenám v histórii.",
    whyDetailed: "Zamknuté obdobie je ochrana pred: 1) Neúmyselnými zmenami - nikto nemôže omylom upraviť starú transakciu. 2) Podvodmi - nemožno spätne 'vylepšovať' účtovníctvo. 3) Auditom - audítor vie, že údaje za zamknuté obdobie sú finálne. Zákon vyžaduje, aby účtovné záznamy boli nemenné.",
    commonMistake: "Nezamknúť obdobie - niekto môže omylom upraviť starú transakciu a skresliť výsledky.",
    howToFix: "Po kontrole vždy zamknite mesiac. Ak potrebujete niečo opraviť v zamknutom období, použite opravnú transakciu v aktuálnom období (storno + nový zápis).",
    accountingContext: "Uzávierka je formálny akt ukončenia účtovného obdobia. Po uzávierke sa zostatky účtov prenášajú do ďalšieho obdobia. Výsledkové účty (5xx, 6xx) sa uzatvárajú cez účet 710 (Účet ziskov a strát).",
    linkPath: "/uctovnictvo/uzavierky",
    linkLabel: "Otvoriť Uzávierky",
  },
  
  // ============================================================================
  // ROČNÁ RUTINA
  // ============================================================================
  "yearly-1": {
    whatToDo: "Skontrolujte, že všetky mesiace sú zamknuté",
    detailedSteps: [
      "1. Otvorte sekciu Uzávierky",
      "2. Skontrolujte stav všetkých 12 mesiacov",
      "3. Všetky mesiace musia byť v stave 'Zamknuté'",
      "4. Ak niektorý mesiac nie je zamknutý, dokončite jeho uzávierku",
      "5. Skontrolujte, že súčet všetkých transakcií je vyvážený (MD = D)",
    ],
    why: "Ročná uzávierka vyžaduje, aby všetky mesiace boli uzavreté.",
    whyDetailed: "Ročná účtovná závierka je súhrn celého účtovného roka. Ak niektorý mesiac nie je uzavretý, môžu sa tam ešte objaviť zmeny, čo by zneplatnilo ročnú závierku. Daňový úrad vyžaduje konzistentné a úplné účtovníctvo.",
    commonMistake: "Zabudnúť zamknúť niektorý mesiac - nekonzistentné údaje v ročnej závierke.",
    howToFix: "Pred ročnou uzávierkou systematicky prejdite všetky mesiace. Začnite od januára a postupne zamykajte.",
    accountingContext: "Ročná uzávierka zahŕňa: 1) Inventarizáciu majetku a záväzkov. 2) Uzatvorenie výsledkových účtov. 3) Výpočet výsledku hospodárenia. 4) Zostavenie účtovnej závierky (súvaha, výkaz ziskov a strát, poznámky).",
    linkPath: "/uctovnictvo/uzavierky",
    linkLabel: "Otvoriť Uzávierky",
  },
  "yearly-2": {
    whatToDo: "Vypočítajte a zaúčtujte daň z príjmov (DPPO)",
    detailedSteps: [
      "1. Otvorte Dashboard - nájdete tam automatický výpočet dane",
      "2. Skontrolujte základ dane (príjmy - výdavky)",
      "3. Systém vypočíta daň podľa aktuálnej sadzby (15% do 49 790€, 21% nad)",
      "4. Vytvorte transakciu pre daň: MD 591 / D 341",
      "5. Suma = vypočítaná daň z príjmov",
      "6. Nezabudnite, že daňové priznanie sa podáva do 31.3. (alebo 30.6. pri odklade)",
    ],
    why: "Daň z príjmov sa musí zaúčtovať pred uzávierkou roka.",
    whyDetailed: "Daň z príjmov právnických osôb (DPPO) je náklad, ktorý ovplyvňuje výsledok hospodárenia. Ak ju nezaúčtujete, váš zisk bude nadhodnotený. Účet 591 je nákladový účet pre daň, účet 341 je záväzok voči daňovému úradu.",
    commonMistake: "Zabudnúť zaúčtovať daň - nesprávny výsledok hospodárenia, chýbajúci záväzok v súvahe.",
    howToFix: "Použite Dashboard pre automatický výpočet. Transakciu vytvorte až po finálnej kontrole všetkých nákladov a výnosov.",
    accountingContext: "Účtovanie dane: MD 591 (Daň z príjmov - splatná) / D 341 (Daň z príjmov). Po zaplatení: MD 341 / D 221. Sadzba DPPO: 15% ak základ dane ≤ 49 790€, inak 21%.",
    linkPath: "/",
    linkLabel: "Otvoriť Dashboard",
  },
  "yearly-3": {
    whatToDo: "Zostavte a exportujte účtovnú závierku",
    detailedSteps: [
      "1. Otvorte Hlavnú knihu v menu Účtovníctvo",
      "2. Skontrolujte zostatky všetkých účtov",
      "3. Exportujte Súvahu (prehľad majetku a zdrojov)",
      "4. Exportujte Výkaz ziskov a strát (prehľad nákladov a výnosov)",
      "5. Pripravte Poznámky k účtovnej závierke (popis účtovných metód)",
      "6. Všetky dokumenty uložte a pripravte pre daňové priznanie",
    ],
    why: "Účtovná závierka je povinná príloha k daňovému priznaniu.",
    whyDetailed: "Účtovná závierka pozostáva z: 1) Súvaha - prehľad majetku (aktíva) a zdrojov jeho krytia (pasíva) k 31.12. 2) Výkaz ziskov a strát - prehľad nákladov a výnosov za celý rok. 3) Poznámky - vysvetlenia k číslam, účtovné metódy, významné udalosti. Závierka sa ukladá do registra účtovných závierok.",
    commonMistake: "Exportovať závierku pred zaúčtovaním dane - čísla nebudú súhlasiť s daňovým priznaním.",
    howToFix: "Postup: 1) Zaúčtujte všetky doklady. 2) Zaúčtujte daň. 3) Zamknite december. 4) Až potom exportujte závierku.",
    accountingContext: "Súvaha: Aktíva = Pasíva (vždy sa musia rovnať). Aktíva = majetok (budovy, stroje, zásoby, pohľadávky, peniaze). Pasíva = zdroje (vlastné imanie, záväzky, úvery). Výkaz Z/S: Výnosy - Náklady = Výsledok hospodárenia.",
    linkPath: "/uctovnictvo/hlavna-kniha",
    linkLabel: "Otvoriť Hlavnú knihu",
  },
};

function GuideDetail({
  guide,
  onBack,
  onToggleStep,
  onReset,
}: {
  guide: Guide;
  onBack: () => void;
  onToggleStep: (stepId: string) => void;
  onReset: () => void;
}) {
  const [guidedMode, setGuidedMode] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  
  const progress = guide.steps.filter((s) => s.completed).length;
  const isComplete = progress === guide.steps.length;
  
  // Find first incomplete step for guided mode
  const firstIncompleteIndex = guide.steps.findIndex((s) => !s.completed);
  
  const startGuidedMode = () => {
    setGuidedMode(true);
    setCurrentStepIndex(firstIncompleteIndex >= 0 ? firstIncompleteIndex : 0);
  };

  if (guidedMode) {
    const currentStep = guide.steps[currentStepIndex];
    const stepDetail = STEP_DETAILS[currentStep.id];
    const isLastStep = currentStepIndex === guide.steps.length - 1;
    
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setGuidedMode(false)}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900"
          >
            <XCircle size={16} />
            Ukončiť režim krok-za-krokom
          </button>
          <span className="text-sm text-slate-500">
            Krok {currentStepIndex + 1} z {guide.steps.length}
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all"
            style={{ width: `${((currentStepIndex + 1) / guide.steps.length) * 100}%` }}
          />
        </div>

        {/* Current step card */}
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
          <div className="bg-gradient-to-r from-slate-900 to-slate-700 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white font-bold">
                {currentStepIndex + 1}
              </div>
              <h2 className="text-xl font-bold text-white">{currentStep.text}</h2>
            </div>
          </div>
          
          <div className="p-6 space-y-4">
            {stepDetail ? (
              <>
                {/* What to do - summary */}
                <div className="bg-blue-50 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Play size={16} className="text-blue-600" />
                    <span className="font-semibold text-blue-900">Čo spraviť</span>
                  </div>
                  <p className="text-blue-800 font-medium">{stepDetail.whatToDo}</p>
                </div>
                
                {/* Detailed steps */}
                {stepDetail.detailedSteps && stepDetail.detailedSteps.length > 0 && (
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <BookOpen size={16} className="text-slate-600" />
                      <span className="font-semibold text-slate-900">Podrobný postup</span>
                    </div>
                    <ol className="space-y-2">
                      {stepDetail.detailedSteps.map((step, i) => (
                        <li key={i} className="text-slate-700 text-sm pl-1">{step}</li>
                      ))}
                    </ol>
                  </div>
                )}
                
                {/* Why - detailed */}
                <div className="bg-emerald-50 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Lightbulb size={16} className="text-emerald-600" />
                    <span className="font-semibold text-emerald-900">Prečo je to dôležité</span>
                  </div>
                  <p className="text-emerald-800 font-medium mb-2">{stepDetail.why}</p>
                  {stepDetail.whyDetailed && (
                    <p className="text-emerald-700 text-sm">{stepDetail.whyDetailed}</p>
                  )}
                </div>
                
                {/* Accounting context */}
                {stepDetail.accountingContext && (
                  <div className="bg-violet-50 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Circle size={16} className="text-violet-600" />
                      <span className="font-semibold text-violet-900">Účtovný kontext</span>
                    </div>
                    <p className="text-violet-800 text-sm font-mono">{stepDetail.accountingContext}</p>
                  </div>
                )}
                
                {/* Common mistake */}
                <div className="bg-amber-50 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle size={16} className="text-amber-600" />
                    <span className="font-semibold text-amber-900">Najčastejšia chyba</span>
                  </div>
                  <p className="text-amber-800">{stepDetail.commonMistake}</p>
                </div>
                
                {/* How to fix */}
                <div className="bg-slate-50 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle size={16} className="text-slate-600" />
                    <span className="font-semibold text-slate-900">Ako to spraviť správne</span>
                  </div>
                  <p className="text-slate-700">{stepDetail.howToFix}</p>
                </div>
                
                {/* Link to screen */}
                {stepDetail.linkPath && (
                  <Link
                    to={stepDetail.linkPath}
                    className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 font-medium"
                  >
                    <ExternalLink size={16} />
                    {stepDetail.linkLabel || "Otvoriť obrazovku"}
                  </Link>
                )}
              </>
            ) : (
              <p className="text-slate-600">Vykonajte tento krok a označte ho ako dokončený.</p>
            )}
          </div>
          
          {/* Actions */}
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex gap-3">
            <button
              onClick={() => setCurrentStepIndex(Math.max(0, currentStepIndex - 1))}
              disabled={currentStepIndex === 0}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-white disabled:opacity-50"
            >
              Späť
            </button>
            <button
              onClick={() => {
                onToggleStep(currentStep.id);
                if (!isLastStep) {
                  setCurrentStepIndex(currentStepIndex + 1);
                } else {
                  setGuidedMode(false);
                }
              }}
              className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700"
            >
              {currentStep.completed ? "Označiť ako nedokončené" : "Označiť ako dokončené"}
            </button>
            {!isLastStep && (
              <button
                onClick={() => setCurrentStepIndex(currentStepIndex + 1)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-white"
              >
                Preskočiť
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-slate-600 hover:text-slate-900"
      >
        <ChevronRight size={16} className="rotate-180" />
        Späť na zoznam
      </button>

      {/* Guide header */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{guide.title}</h2>
            <p className="text-slate-600 mt-1">{guide.description}</p>
          </div>
          {isComplete && (
            <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-sm font-medium">
              ✓ Dokončené
            </span>
          )}
        </div>

        {/* Guided mode button */}
        {!isComplete && (
          <button
            onClick={startGuidedMode}
            className="w-full mb-6 px-4 py-3 bg-gradient-to-r from-slate-900 to-slate-700 text-white rounded-xl hover:from-slate-800 hover:to-slate-600 font-medium flex items-center justify-center gap-2"
          >
            <Play size={18} />
            Spustiť režim krok-za-krokom
          </button>
        )}

        {/* Progress */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${isComplete ? "bg-emerald-500" : "bg-slate-900"}`}
              style={{ width: `${(progress / guide.steps.length) * 100}%` }}
            />
          </div>
          <span className="text-sm font-medium text-slate-700">
            {progress}/{guide.steps.length} krokov
          </span>
        </div>

        {/* Steps */}
        <div className="space-y-2">
          {guide.steps.map((step, index) => (
            <div
              key={step.id}
              onClick={() => onToggleStep(step.id)}
              className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
                step.completed ? "bg-emerald-50" : "bg-slate-50 hover:bg-slate-100"
              }`}
            >
              {step.completed ? (
                <CheckCircle size={20} className="text-emerald-600 flex-shrink-0" />
              ) : (
                <Circle size={20} className="text-slate-400 flex-shrink-0" />
              )}
              <span className={`flex-1 ${step.completed ? "text-emerald-700 line-through" : "text-slate-700"}`}>
                {index + 1}. {step.text}
              </span>
            </div>
          ))}
        </div>

        {/* Reset button */}
        {progress > 0 && (
          <button
            onClick={onReset}
            className="mt-4 text-sm text-slate-500 hover:text-slate-700"
          >
            Resetovať postup
          </button>
        )}
      </div>

      {/* Common mistakes */}
      {guide.commonMistakes.length > 0 && (
        <div className="bg-amber-50 rounded-2xl border border-amber-100 p-6">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={20} className="text-amber-600" />
            <h3 className="font-semibold text-amber-900">Najčastejšie chyby</h3>
          </div>
          <ul className="space-y-2">
            {guide.commonMistakes.map((mistake, i) => (
              <li key={i} className="flex items-start gap-2 text-amber-800">
                <span className="text-amber-500">•</span>
                {mistake}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Quick links */}
      {guide.links.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h3 className="font-semibold text-slate-900 mb-3">Rýchle akcie</h3>
          <div className="flex flex-wrap gap-2">
            {guide.links.map((link, i) => (
              <Link
                key={i}
                to={link.path}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors text-sm font-medium"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
