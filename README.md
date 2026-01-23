# GPCS Účto - Podvojné účtovníctvo pre s.r.o.

Profesionálny účtovný systém pre slovenskú s.r.o. v sústave **podvojného účtovníctva**. Web + PWA, Firebase backend.

## Profil firmy

- s.r.o. (neplatca DPH)
- 1 zamestnanec
- Bez pokladne (len banka)
- Auto prenajaté do s.r.o. od FO

## Funkcie

### Operatíva
- **Dashboard** - Prehľad financií, dane (DPPO), dividendy a zisk
- **Doklady (Inbox)** - Drag&drop upload PDF/JPG/PNG s AI extrakciou údajov
- **Faktúry (vystavené)** - Tvorba a správa vystavených faktúr s IČO lookup
- **Partneri** - Databáza obchodných partnerov s automatickým IČO lookup
- **Nastavenia** - Konfigurácia daňových sadzieb a firemných údajov

### Vedenie účtovníctva
- **Účtovanie** - Transakcie s podvojným zápisom MD/D, validácia ΣMD = ΣD
- **Účtovný denník** - Chronologický prehľad všetkých zápisov
- **Hlavná kniha** - Agregovaný prehľad obratov a zostatkov po účtoch
- **Saldokonto** - Pohľadávky (311) a záväzky (321) po partneroch
- **Banka (221)** - Pohyby na bankovom účte
- **Účtový rozvrh** - Správa účtov (221, 311, 321, 331, 336, 342, 518, 521, 524, 602, 591)
- **Šablóny účtovania** - Predpripravené šablóny pre bežné operácie
- **Mzdy** - Wizard pre spracovanie mzdy 1 zamestnanca
- **Uzávierky** - Mesačná a ročná uzávierka s lockovaním období
- **Návody** - Praktické postupy (denná/týždenná/mesačná/ročná rutina)
- **Povinnosti & Termíny** - Kalendár úloh s checklistami
- **Notifikácie** - Pripomienky a upozornenia

## Technologie

- **Frontend**: React 19 + TypeScript + Vite
- **Styling**: TailwindCSS + shadcn/ui
- **Backend**: Firebase (Auth, Firestore, Storage)
- **Ikony**: Lucide React

## Instalacia

```bash
# Klonovanie repozitara
git clone <repository-url>
cd gpcs-ucto

# Instalacia zavislosti
npm install

# Kopirovanie environment premennych
cp .env.example .env.local

# Uprava .env.local s Firebase credentials
# (ziskajte z Firebase Console > Project Settings)

# Spustenie dev servera
npm run dev
```

## Environment premenne

Vytvorte `.env.local` subor s nasledujucimi premennymi:

```
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_OPENAI_API_KEY=your_openai_key (volitelne - pre AI extrakciu)
```

## Skripty

```bash
npm run dev      # Spusti development server
npm run build    # Build pre produkciu
npm run preview  # Nahlad produkcie
npm run lint     # Spusti ESLint
npm run test     # Spusti testy
```

## Firestore štruktúra

```
companies/{companyId}/
  settings/main              - Firemné nastavenia a daňové sadzby
  settings/guides            - Stav návodov (checklisty)
  settings/payroll           - Konfigurácia miezd (sadzby)
  settings/notifications     - Nastavenia notifikácií
  chartOfAccounts/{code}     - Účtový rozvrh (221, 311, 321, ...)
  templates/{templateId}     - Šablóny účtovania
  partners/{partnerId}       - Obchodní partneri
  transactions/{txId}        - Účtovné transakcie (MD/D)
  documents/{docId}          - Doklady (faktúry, výpisy)
  uploads/{uploadId}         - Uploadnuté súbory
  tasks/{taskId}             - Úlohy a termíny
  notifications/{notifId}    - Notifikácie (história)
  payroll/{runId}            - Mzdové výpočty
  periodLocks/{period}       - Zamknuté obdobia (YYYY-MM)
  exports/{exportId}         - Exporty (PDF/CSV)
```

## Podvojné účtovníctvo

### Účtový rozvrh (predvolené účty)
- **221** - Bankové účty
- **311** - Pohľadávky z obchodného styku
- **321** - Záväzky z obchodného styku
- **331** - Zamestnanci
- **336** - Zúčtovanie s orgánmi SP a ZP
- **342** - Ostatné priame dane
- **518** - Ostatné služby
- **521** - Mzdové náklady
- **524** - Zákonné sociálne poistenie
- **591** - Daň z príjmov - splatná
- **602** - Tržby z predaja služieb

### Šablóny účtovania
- Vystavená FA (služby): MD 311 / D 602
- Úhrada od odberateľa: MD 221 / D 311
- Prijatá FA (služby): MD 518 / D 321
- Úhrada dodávateľovi: MD 321 / D 221
- Mzdy: 521/331, 524/336, 331/336, 331/342, 331/221, 336/221, 342/221

## Daňové výpočty

- **DPPO** - Daň z príjmov právnických osôb (10% fixed alebo AUTO_BRACKETS)
- **Dividendy** - Zrážková daň 7%
- **Odpočítateľné výdavky** - Konfigurovateľné percento odpočtu

## Mzdy - konfigurácia

Sadzby miezd sú konfigurovateľné v UI (Mzdy → Nastavenia):

| Parameter | Predvolená hodnota |
|-----------|-------------------|
| ZP zamestnanec | 4% |
| SP zamestnanec | 9.4% |
| ZP zamestnávateľ | 10% |
| SP zamestnávateľ | 25.2% |
| Sadzba dane | 19% |
| Nezdaniteľná časť | 4922.82 €/rok |

Mzdový výpočet automaticky vytvorí 4 transakcie:
1. Mzda náklad (521/331, 524/336, 331/336, 331/342)
2. Výplata mzdy (331/221)
3. Úhrada odvodov (336/221)
4. Úhrada dane (342/221)

## Push notifikácie

Aplikácia podporuje PWA push notifikácie:
1. Otvorte Notifikácie → kliknite "Povoliť"
2. Prehliadač si vyžiada povolenie
3. Po povolení budete dostávať pripomienky

## Uzávierky

### Mesačná uzávierka
1. Skontrolujte Inbox (0 nezaúčtovaných)
2. Skontrolujte Saldokonto 311/321
3. Skontrolujte Banku 221
4. Exportujte denník (CSV)
5. Zamknite obdobie

### Ročná uzávierka
- Všetky mesiace musia byť zamknuté
- Export balíka pre DPPO a RÚZ

## Ďalšie kroky (TODO)

- [ ] Bank feed import (automatické načítanie výpisov z banky)
- [ ] Automatické párovanie platieb podľa VS
- [ ] Export pre DPPO formulár
- [ ] Export pre RÚZ (súvaha, výkaz ziskov a strát)
- [ ] Integrácia s eDane
- [ ] Email notifikácie

## Licencia

Proprietary - GPCS s.r.o.
