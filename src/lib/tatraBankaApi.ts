// src/lib/tatraBankaApi.ts
// Tatra Banka Open Banking API integration
// Documentation: https://developer.tatrabanka.sk

import { db } from "@/firebase";
import { doc, getDoc, setDoc, Timestamp } from "firebase/firestore";

// ============================================================================
// TYPES
// ============================================================================

export interface TatraBankaCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  iban: string; // Primary bank account IBAN
}

export interface TatraBankaToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // Unix timestamp
  scope?: string;
}

export interface TatraBankaAccount {
  iban: string;
  currency: string;
  name?: string;
  balance?: number;
}

export interface TatraBankaTransaction {
  id: string;
  date: string; // ISO date
  valueDate?: string;
  amount: number;
  currency: string;
  type: "CREDIT" | "DEBIT";
  description: string;
  counterpartyIban?: string;
  counterpartyName?: string;
  variableSymbol?: string;
  constantSymbol?: string;
  specificSymbol?: string;
  reference?: string;
  status: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const TB_API_BASE = "https://api.tatrabanka.sk/premium/production";
const TB_AUTH_URL = "https://api.tatrabanka.sk/premium/production/auth";
const TB_TOKEN_URL = "https://api.tatrabanka.sk/premium/production/token";

// Sandbox URLs for testing
const TB_SANDBOX_API_BASE = "https://api.tatrabanka.sk/premium/sandbox";
const TB_SANDBOX_AUTH_URL = "https://api.tatrabanka.sk/premium/sandbox/auth";
const TB_SANDBOX_TOKEN_URL = "https://api.tatrabanka.sk/premium/sandbox/token";

function getCompanyId(): string {
  const stored = localStorage.getItem("gpcs-company-id");
  return stored || "gpcs";
}

// ============================================================================
// CREDENTIALS MANAGEMENT (stored in Firestore)
// ============================================================================

export async function getTatraBankaCredentials(): Promise<TatraBankaCredentials | null> {
  const companyId = getCompanyId();
  const ref = doc(db, "companies", companyId, "settings", "tatraBanka");
  const snap = await getDoc(ref);
  
  if (!snap.exists()) return null;
  
  const data = snap.data();
  return {
    clientId: data.clientId || "",
    clientSecret: data.clientSecret || "",
    redirectUri: data.redirectUri || "https://www.univerzalkalkulacka.sk/uctovnictvo/banka",
    iban: data.iban || "",
  };
}

export async function saveTatraBankaCredentials(
  credentials: TatraBankaCredentials
): Promise<void> {
  const companyId = getCompanyId();
  const ref = doc(db, "companies", companyId, "settings", "tatraBanka");
  await setDoc(ref, {
    ...credentials,
    updatedAt: Timestamp.now(),
  }, { merge: true });
}

// ============================================================================
// TOKEN MANAGEMENT
// ============================================================================

export async function getTatraBankaToken(): Promise<TatraBankaToken | null> {
  const companyId = getCompanyId();
  const ref = doc(db, "companies", companyId, "settings", "tatraBankaToken");
  const snap = await getDoc(ref);
  
  if (!snap.exists()) return null;
  
  const data = snap.data();
  return {
    accessToken: data.accessToken || "",
    refreshToken: data.refreshToken,
    expiresAt: data.expiresAt || 0,
    scope: data.scope,
  };
}

async function saveTatraBankaToken(token: TatraBankaToken): Promise<void> {
  const companyId = getCompanyId();
  const ref = doc(db, "companies", companyId, "settings", "tatraBankaToken");
  await setDoc(ref, {
    ...token,
    updatedAt: Timestamp.now(),
  });
}

export function isTokenValid(token: TatraBankaToken | null): boolean {
  if (!token) return false;
  // Consider token valid if it expires in more than 5 minutes
  return token.expiresAt > Date.now() + 5 * 60 * 1000;
}

// ============================================================================
// OAUTH2 AUTHORIZATION
// ============================================================================

export function getAuthorizationUrl(credentials: TatraBankaCredentials, useSandbox = false): string {
  const authUrl = useSandbox ? TB_SANDBOX_AUTH_URL : TB_AUTH_URL;
  const params = new URLSearchParams({
    client_id: credentials.clientId,
    redirect_uri: credentials.redirectUri,
    response_type: "code",
    scope: "AISP", // Account Information Service Provider
    state: crypto.randomUUID(),
  });
  
  // Store state for verification
  localStorage.setItem("tb_oauth_state", params.get("state")!);
  
  return `${authUrl}?${params.toString()}`;
}

export async function exchangeCodeForToken(
  code: string,
  credentials: TatraBankaCredentials,
  useSandbox = false
): Promise<TatraBankaToken> {
  const tokenUrl = useSandbox ? TB_SANDBOX_TOKEN_URL : TB_TOKEN_URL;
  
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${btoa(`${credentials.clientId}:${credentials.clientSecret}`)}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: credentials.redirectUri,
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }
  
  const data = await response.json();
  
  const token: TatraBankaToken = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
    scope: data.scope,
  };
  
  await saveTatraBankaToken(token);
  return token;
}

export async function refreshAccessToken(
  credentials: TatraBankaCredentials,
  refreshToken: string,
  useSandbox = false
): Promise<TatraBankaToken> {
  const tokenUrl = useSandbox ? TB_SANDBOX_TOKEN_URL : TB_TOKEN_URL;
  
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${btoa(`${credentials.clientId}:${credentials.clientSecret}`)}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${error}`);
  }
  
  const data = await response.json();
  
  const token: TatraBankaToken = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
    scope: data.scope,
  };
  
  await saveTatraBankaToken(token);
  return token;
}

// ============================================================================
// API CALLS
// ============================================================================

async function apiRequest<T>(
  endpoint: string,
  accessToken: string,
  options: RequestInit = {},
  useSandbox = false
): Promise<T> {
  const baseUrl = useSandbox ? TB_SANDBOX_API_BASE : TB_API_BASE;
  
  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API request failed: ${response.status} ${error}`);
  }
  
  return response.json();
}

export async function getAccounts(
  accessToken: string,
  useSandbox = false
): Promise<TatraBankaAccount[]> {
  const data = await apiRequest<{ accounts: any[] }>(
    "/v1/accounts",
    accessToken,
    { method: "GET" },
    useSandbox
  );
  
  return data.accounts.map((acc) => ({
    iban: acc.iban,
    currency: acc.currency,
    name: acc.name,
    balance: acc.balance?.amount,
  }));
}

export async function getTransactions(
  accessToken: string,
  iban: string,
  dateFrom: Date,
  dateTo: Date,
  useSandbox = false
): Promise<TatraBankaTransaction[]> {
  const data = await apiRequest<{ transactions: any[] }>(
    `/v1/accounts/${iban}/transactions`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        dateFrom: dateFrom.toISOString().slice(0, 10),
        dateTo: dateTo.toISOString().slice(0, 10),
        status: "ALL",
        page: 1,
        pageSize: 100,
      }),
    },
    useSandbox
  );
  
  return (data.transactions || []).map((tx: any) => {
    // Parse symbols from reference string (format: /VS123/SS456/KS0308)
    let variableSymbol: string | undefined;
    let specificSymbol: string | undefined;
    let constantSymbol: string | undefined;
    
    const ref = tx.remittanceInformationUnstructured || tx.reference || "";
    const vsMatch = ref.match(/\/VS(\d+)/i);
    const ssMatch = ref.match(/\/SS(\d+)/i);
    const ksMatch = ref.match(/\/KS(\d+)/i);
    
    if (vsMatch) variableSymbol = vsMatch[1];
    if (ssMatch) specificSymbol = ssMatch[1];
    if (ksMatch) constantSymbol = ksMatch[1];
    
    return {
      id: tx.transactionId || tx.entryReference || `${tx.bookingDate}-${tx.amount?.amount}`,
      date: tx.bookingDate || tx.valueDate,
      valueDate: tx.valueDate,
      amount: Math.abs(parseFloat(tx.amount?.amount || "0")),
      currency: tx.amount?.currency || "EUR",
      type: parseFloat(tx.amount?.amount || "0") >= 0 ? "CREDIT" : "DEBIT",
      description: tx.remittanceInformationUnstructured || tx.additionalInformation || "",
      counterpartyIban: tx.creditorAccount?.iban || tx.debtorAccount?.iban,
      counterpartyName: tx.creditorName || tx.debtorName,
      variableSymbol,
      specificSymbol,
      constantSymbol,
      reference: ref,
      status: tx.status || "BOOKED",
    };
  });
}

// ============================================================================
// AUTO-PAIRING LOGIC
// ============================================================================

import type { Entry } from "./schemas";

export interface PairingMatch {
  bankTransaction: TatraBankaTransaction;
  entry: Entry;
  confidence: number; // 0-100
  matchReasons: string[];
}

/**
 * Finds potential matches between bank transactions and unpaid entries.
 * Matching criteria:
 * 1. Variable Symbol (VS) matches docNumber or payment.vs → 40 points
 * 2. Amount matches exactly → 30 points
 * 3. Amount within 1% tolerance → 20 points
 * 4. Partner name contains counterparty name → 20 points
 * 5. Transaction type matches entry type (CREDIT→INCOME, DEBIT→EXPENSE) → 10 points
 */
export function findPairingMatches(
  transactions: TatraBankaTransaction[],
  entries: Entry[]
): PairingMatch[] {
  const matches: PairingMatch[] = [];
  
  // Filter unpaid entries
  const unpaidEntries = entries.filter(
    (e) => e.payment.status !== "PAID"
  );
  
  for (const tx of transactions) {
    for (const entry of unpaidEntries) {
      let confidence = 0;
      const matchReasons: string[] = [];
      
      // 1. Check Variable Symbol match
      const entryVS = entry.payment.vs || entry.docNumber || "";
      if (tx.variableSymbol && entryVS) {
        // Normalize: remove leading zeros
        const txVS = tx.variableSymbol.replace(/^0+/, "");
        const eVS = entryVS.replace(/^0+/, "").replace(/\D/g, "");
        
        if (txVS === eVS || entryVS.includes(tx.variableSymbol)) {
          confidence += 40;
          matchReasons.push(`VS: ${tx.variableSymbol}`);
        }
      }
      
      // 2. Check amount match
      const entryAmount = entry.amount;
      const txAmount = tx.amount;
      
      if (Math.abs(entryAmount - txAmount) < 0.01) {
        confidence += 30;
        matchReasons.push(`Suma: ${txAmount} €`);
      } else if (Math.abs(entryAmount - txAmount) / entryAmount < 0.01) {
        confidence += 20;
        matchReasons.push(`Suma ≈ ${txAmount} €`);
      }
      
      // 3. Check partner/counterparty name
      const partnerName = entry.partnerSnapshot?.name?.toLowerCase() || "";
      const counterpartyName = tx.counterpartyName?.toLowerCase() || "";
      
      if (partnerName && counterpartyName) {
        if (partnerName.includes(counterpartyName) || counterpartyName.includes(partnerName)) {
          confidence += 20;
          matchReasons.push(`Partner: ${tx.counterpartyName}`);
        }
      }
      
      // 4. Check type match
      const isIncomeMatch = tx.type === "CREDIT" && entry.type === "INCOME";
      const isExpenseMatch = tx.type === "DEBIT" && entry.type === "EXPENSE";
      
      if (isIncomeMatch || isExpenseMatch) {
        confidence += 10;
        matchReasons.push(isIncomeMatch ? "Príjem" : "Výdaj");
      }
      
      // Only include matches with reasonable confidence
      if (confidence >= 30) {
        matches.push({
          bankTransaction: tx,
          entry,
          confidence,
          matchReasons,
        });
      }
    }
  }
  
  // Sort by confidence descending
  matches.sort((a, b) => b.confidence - a.confidence);
  
  return matches;
}
