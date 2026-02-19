// src/pages/accounting/Bank.tsx
import { useState, useEffect, useCallback } from "react";
import { Search, Download, X, ArrowUpRight, ArrowDownLeft, AlertTriangle, Settings, RefreshCw, CheckCircle2, Zap } from "lucide-react";
import { db } from "@/firebase";
import { collection, getDocs, Timestamp } from "firebase/firestore";
import { useUser } from "@/components/AuthGate";
import type { Transaction, TransactionLine } from "@/lib/accountingSchemas";
import type { Entry } from "@/lib/schemas";
import { subscribeToEntries } from "@/lib/firebaseServices";
import { 
  getTemplatesForType, 
  createTransactionFromTemplate,
  type ExtendedTemplate 
} from "@/lib/templateEngine";
import { validateEntity, logAuditEntry, type RuleResult, type BankPairingData } from "@/lib/ruleEngine";
import { ValidationModal } from "@/components/HelpTip";
import {
  getTatraBankaCredentials,
  saveTatraBankaCredentials,
  getTatraBankaToken,
  isTokenValid,
  getAuthorizationUrl,
  exchangeCodeForToken,
  getTransactions,
  findPairingMatches,
  type TatraBankaCredentials,
  type TatraBankaTransaction,
  type PairingMatch,
} from "@/lib/tatraBankaApi";
import { createTransactionFromEntry } from "@/lib/autoAccounting";

function getCompanyId(): string {
  const stored = localStorage.getItem("gpcs-company-id");
  return stored || "gpcs";
}

function formatDate(ts: Timestamp): string {
  return ts.toDate().toLocaleDateString("sk-SK");
}

function formatEUR(amount: number): string {
  return new Intl.NumberFormat("sk-SK", { style: "currency", currency: "EUR" }).format(amount);
}

interface BankMovement {
  transactionId: string;
  transactionNumber: string;
  date: Timestamp;
  description: string;
  amount: number; // positive = receipt, negative = payment
  counterAccount: string;
  counterAccountName: string;
  partnerId?: string;
  partnerName?: string;
  isPaired: boolean;
  line: TransactionLine;
}

interface OpenItem {
  transactionId: string;
  transactionNumber: string;
  date: Timestamp;
  description: string;
  partnerId: string;
  partnerName: string;
  accountCode: string; // 311 or 321
  amount: number;
  paidAmount: number;
  remainingAmount: number;
}

export default function Bank() {
  const user = useUser();
  const [movements, setMovements] = useState<BankMovement[]>([]);
  const [openItems, setOpenItems] = useState<OpenItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodFilter, setPeriodFilter] = useState<string>(new Date().toISOString().slice(0, 7));
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "receipt" | "payment">("all");
  const [showPairingModal, setShowPairingModal] = useState(false);
  const [selectedMovement, setSelectedMovement] = useState<BankMovement | null>(null);
  const [templates, setTemplates] = useState<ExtendedTemplate[]>([]);

  // Tatra Banka API state
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [tbCredentials, setTbCredentials] = useState<TatraBankaCredentials | null>(null);
  const [tbConnected, setTbConnected] = useState(false);
  const [tbTransactions, setTbTransactions] = useState<TatraBankaTransaction[]>([]);
  const [tbLoading, setTbLoading] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [pairingMatches, setPairingMatches] = useState<PairingMatch[]>([]);
  const [showAutoPairModal, setShowAutoPairModal] = useState(false);

  // Load entries for auto-pairing
  useEffect(() => {
    const unsub = subscribeToEntries(setEntries);
    return () => unsub();
  }, []);

  // Load Tatra Banka credentials and check connection
  useEffect(() => {
    async function loadTbStatus() {
      const creds = await getTatraBankaCredentials();
      setTbCredentials(creds);
      
      if (creds?.clientId) {
        const token = await getTatraBankaToken();
        setTbConnected(isTokenValid(token));
      }
    }
    loadTbStatus();
  }, []);

  // Handle OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    
    if (code && tbCredentials) {
      (async () => {
        try {
          await exchangeCodeForToken(code, tbCredentials);
          setTbConnected(true);
          // Clean URL
          window.history.replaceState({}, "", window.location.pathname);
        } catch (err) {
          console.error("OAuth callback failed:", err);
          alert("Pripojenie k Tatra Banke zlyhalo");
        }
      })();
    }
  }, [tbCredentials]);

  useEffect(() => {
    loadData();
  }, [periodFilter]);

  async function loadData() {
    setLoading(true);
    const companyId = getCompanyId();
    
    // Load transactions
    const transactionsRef = collection(db, "companies", companyId, "transactions");
    const transactionsSnap = await getDocs(transactionsRef);
    
    const bankMovements: BankMovement[] = [];
    const items311: Map<string, OpenItem> = new Map();
    const items321: Map<string, OpenItem> = new Map();
    
    transactionsSnap.docs.forEach((docSnap) => {
      const transaction = { id: docSnap.id, ...docSnap.data() } as Transaction;
      
      // Only POSTED or LOCKED
      if (transaction.status === "DRAFT") return;
      
      // Process each line
      transaction.lines.forEach((line) => {
        // Bank movements (221)
        if (line.accountCode === "221") {
          // Filter by period
          if (periodFilter && transaction.period !== periodFilter) return;
          
          // Find counter account (the other side)
          const counterLine = transaction.lines.find((l) => l.accountCode !== "221");
          
          // Determine if paired (has partner on 311/321 line)
          const partnerLine = transaction.lines.find((l) => 
            (l.accountCode === "311" || l.accountCode === "321") && l.partnerId
          );
          
          bankMovements.push({
            transactionId: transaction.id,
            transactionNumber: transaction.number,
            date: transaction.date,
            description: transaction.description,
            amount: line.side === "MD" ? line.amount : -line.amount,
            counterAccount: counterLine?.accountCode || "???",
            counterAccountName: counterLine?.accountName || "",
            partnerId: partnerLine?.partnerId,
            partnerName: partnerLine?.partnerName,
            isPaired: !!partnerLine?.partnerId,
            line,
          });
        }
        
        // Track 311/321 for open items
        if (line.accountCode === "311" && line.partnerId) {
          const key = `${line.partnerId}-311`;
          const existing = items311.get(key);
          if (existing) {
            if (line.side === "MD") {
              existing.amount += line.amount;
            } else {
              existing.paidAmount += line.amount;
            }
            existing.remainingAmount = existing.amount - existing.paidAmount;
          } else {
            items311.set(key, {
              transactionId: transaction.id,
              transactionNumber: transaction.number,
              date: transaction.date,
              description: transaction.description,
              partnerId: line.partnerId,
              partnerName: line.partnerName || "Neznámy",
              accountCode: "311",
              amount: line.side === "MD" ? line.amount : 0,
              paidAmount: line.side === "D" ? line.amount : 0,
              remainingAmount: line.side === "MD" ? line.amount : -line.amount,
            });
          }
        }
        
        if (line.accountCode === "321" && line.partnerId) {
          const key = `${line.partnerId}-321`;
          const existing = items321.get(key);
          if (existing) {
            if (line.side === "D") {
              existing.amount += line.amount;
            } else {
              existing.paidAmount += line.amount;
            }
            existing.remainingAmount = existing.amount - existing.paidAmount;
          } else {
            items321.set(key, {
              transactionId: transaction.id,
              transactionNumber: transaction.number,
              date: transaction.date,
              description: transaction.description,
              partnerId: line.partnerId,
              partnerName: line.partnerName || "Neznámy",
              accountCode: "321",
              amount: line.side === "D" ? line.amount : 0,
              paidAmount: line.side === "MD" ? line.amount : 0,
              remainingAmount: line.side === "D" ? line.amount : -line.amount,
            });
          }
        }
      });
    });
    
    // Sort by date desc
    bankMovements.sort((a, b) => {
      const dateA = a.date instanceof Timestamp ? a.date.toDate() : new Date();
      const dateB = b.date instanceof Timestamp ? b.date.toDate() : new Date();
      return dateB.getTime() - dateA.getTime();
    });
    
    // Filter open items with remaining balance
    const allOpenItems = [
      ...Array.from(items311.values()).filter((i) => Math.abs(i.remainingAmount) > 0.01),
      ...Array.from(items321.values()).filter((i) => Math.abs(i.remainingAmount) > 0.01),
    ];
    
    setMovements(bankMovements);
    setOpenItems(allOpenItems);
    
    // Load templates for pairing
    const receiptTemplates = await getTemplatesForType("BANK_RECEIPT");
    const paymentTemplates = await getTemplatesForType("BANK_PAYMENT");
    setTemplates([...receiptTemplates, ...paymentTemplates]);
    
    setLoading(false);
  }

  const filteredMovements = movements.filter((m) => {
    const matchesSearch = 
      m.transactionNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.partnerName?.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesType = 
      filterType === "all" ||
      (filterType === "receipt" && m.amount > 0) ||
      (filterType === "payment" && m.amount < 0);
    return matchesSearch && matchesType;
  });

  // Calculate totals
  const totalReceipts = filteredMovements.filter((m) => m.amount > 0).reduce((sum, m) => sum + m.amount, 0);
  const totalPayments = filteredMovements.filter((m) => m.amount < 0).reduce((sum, m) => sum + Math.abs(m.amount), 0);
  const balance = totalReceipts - totalPayments;

  const exportCSV = () => {
    const headers = ["Dátum", "Číslo", "Popis", "Partner", "Protiúčet", "Príjem", "Výdaj"];
    const rows = filteredMovements.map((m) => [
      formatDate(m.date),
      m.transactionNumber,
      m.description,
      m.partnerName || "",
      m.counterAccount,
      m.amount > 0 ? m.amount.toFixed(2) : "",
      m.amount < 0 ? Math.abs(m.amount).toFixed(2) : "",
    ]);
    
    const csv = [headers.join(";"), ...rows.map((r) => r.map((c) => `"${c}"`).join(";"))].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `banka-221-${periodFilter}.csv`;
    a.click();
  };

  const openPairing = (movement: BankMovement) => {
    setSelectedMovement(movement);
    setShowPairingModal(true);
  };

  // Fetch transactions from Tatra Banka API
  const fetchTatraBankaTransactions = useCallback(async () => {
    if (!tbCredentials?.iban) {
      alert("Najprv nastavte IBAN v nastaveniach");
      setShowSettingsModal(true);
      return;
    }

    const token = await getTatraBankaToken();
    if (!isTokenValid(token)) {
      // Redirect to OAuth
      const authUrl = getAuthorizationUrl(tbCredentials);
      window.location.href = authUrl;
      return;
    }

    setTbLoading(true);
    try {
      // Get transactions for current month
      const [year, month] = periodFilter.split("-").map(Number);
      const dateFrom = new Date(year, month - 1, 1);
      const dateTo = new Date(year, month, 0); // Last day of month

      const transactions = await getTransactions(
        token!.accessToken,
        tbCredentials.iban,
        dateFrom,
        dateTo
      );

      setTbTransactions(transactions);

      // Find pairing matches
      const matches = findPairingMatches(transactions, entries);
      setPairingMatches(matches);

      if (matches.length > 0) {
        setShowAutoPairModal(true);
      } else {
        alert(`Načítaných ${transactions.length} transakcií z Tatra Banky. Žiadne návrhy na párovanie.`);
      }
    } catch (err: any) {
      console.error("Failed to fetch TB transactions:", err);
      alert(`Chyba: ${err?.message || "Nepodarilo sa načítať transakcie"}`);
    }
    setTbLoading(false);
  }, [tbCredentials, periodFilter, entries]);

  // Handle auto-pair confirmation
  const handleAutoPair = async (match: PairingMatch) => {
    if (!user) return;

    try {
      // Mark entry as paid and create the accounting transaction
      await createTransactionFromEntry(match.entry, user.uid);
      
      // Remove from matches
      setPairingMatches((prev) => prev.filter((m) => m.entry.id !== match.entry.id));
      
      // Reload data
      await loadData();
      
      alert(`Úspešne spárované: ${match.entry.description || match.entry.docNumber}`);
    } catch (err: any) {
      console.error("Auto-pair failed:", err);
      alert(`Chyba: ${err?.message || "Párovanie zlyhalo"}`);
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Banka (221)</h1>
          <p className="text-slate-500">
            Pohyby na bankovom účte a párovanie platieb
            {tbConnected && (
              <span className="ml-2 inline-flex items-center gap-1 text-emerald-600">
                <CheckCircle2 size={14} />
                Tatra Banka pripojená
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowSettingsModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors"
          >
            <Settings size={18} />
            Nastavenia
          </button>
          <button
            onClick={fetchTatraBankaTransactions}
            disabled={tbLoading}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {tbLoading ? (
              <RefreshCw size={18} className="animate-spin" />
            ) : (
              <Zap size={18} />
            )}
            {tbLoading ? "Načítavam..." : "Auto-párovanie"}
          </button>
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors"
          >
            <Download size={20} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <ArrowDownLeft size={20} className="text-emerald-600" />
            </div>
            <div>
              <div className="text-sm text-slate-500">Príjmy</div>
              <div className="text-xl font-bold text-emerald-600">{formatEUR(totalReceipts)}</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
              <ArrowUpRight size={20} className="text-rose-600" />
            </div>
            <div>
              <div className="text-sm text-slate-500">Výdaje</div>
              <div className="text-xl font-bold text-rose-600">{formatEUR(totalPayments)}</div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="text-sm text-slate-500">Zostatok za obdobie</div>
          <div className={`text-xl font-bold ${balance >= 0 ? "text-slate-900" : "text-rose-600"}`}>
            {formatEUR(balance)}
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="text-sm text-slate-500">Pohyby</div>
          <div className="text-xl font-bold text-slate-900">{filteredMovements.length}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Hľadať..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
            />
          </div>
          <input
            type="month"
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
          />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as "all" | "receipt" | "payment")}
            className="px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
          >
            <option value="all">Všetky pohyby</option>
            <option value="receipt">Len príjmy</option>
            <option value="payment">Len výdaje</option>
          </select>
        </div>
      </div>

      {/* Movements table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50">
                <th className="text-left text-xs font-medium text-slate-500 uppercase px-6 py-3">Dátum</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase px-6 py-3">Číslo</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase px-6 py-3">Popis</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase px-6 py-3">Partner</th>
                <th className="text-center text-xs font-medium text-slate-500 uppercase px-6 py-3">Protiúčet</th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase px-6 py-3">Suma</th>
                <th className="text-center text-xs font-medium text-slate-500 uppercase px-6 py-3">Stav</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredMovements.map((movement) => (
                <tr key={`${movement.transactionId}-${movement.line.id}`} className="hover:bg-slate-50">
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {formatDate(movement.date)}
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-mono text-sm text-slate-900">{movement.transactionNumber}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate">
                    {movement.description}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {movement.partnerName || <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`font-mono text-sm px-2 py-1 rounded ${
                      movement.counterAccount === "311" ? "bg-blue-100 text-blue-700" :
                      movement.counterAccount === "321" ? "bg-purple-100 text-purple-700" :
                      "bg-slate-100 text-slate-600"
                    }`}>
                      {movement.counterAccount}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className={`font-mono text-sm font-semibold ${
                      movement.amount > 0 ? "text-emerald-600" : "text-rose-600"
                    }`}>
                      {movement.amount > 0 ? "+" : ""}{formatEUR(movement.amount)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    {movement.isPaired ? (
                      <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">
                        Spárované
                      </span>
                    ) : (
                      <button
                        onClick={() => openPairing(movement)}
                        className="px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium hover:bg-amber-200"
                      >
                        Spárovať
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filteredMovements.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                    Žiadne pohyby v tomto období
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pairing Modal */}
      {showPairingModal && selectedMovement && (
        <PairingModal
          movement={selectedMovement}
          openItems={openItems}
          templates={templates}
          userId={user?.uid || ""}
          onClose={() => {
            setShowPairingModal(false);
            setSelectedMovement(null);
          }}
          onSuccess={() => {
            setShowPairingModal(false);
            setSelectedMovement(null);
            loadData();
          }}
        />
      )}

      {/* Tatra Banka Settings Modal */}
      {showSettingsModal && (
        <TatraBankaSettingsModal
          credentials={tbCredentials}
          onSave={async (creds) => {
            await saveTatraBankaCredentials(creds);
            setTbCredentials(creds);
            setShowSettingsModal(false);
          }}
          onClose={() => setShowSettingsModal(false)}
        />
      )}

      {/* Auto-Pair Suggestions Modal */}
      {showAutoPairModal && pairingMatches.length > 0 && (
        <AutoPairModal
          matches={pairingMatches}
          tbTransactions={tbTransactions}
          onPair={handleAutoPair}
          onClose={() => setShowAutoPairModal(false)}
        />
      )}
    </div>
  );
}

// ============================================================================
// PAIRING MODAL
// ============================================================================

function PairingModal({
  movement,
  openItems,
  templates,
  userId,
  onClose,
  onSuccess,
}: {
  movement: BankMovement;
  openItems: OpenItem[];
  templates: ExtendedTemplate[];
  userId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [selectedItem, setSelectedItem] = useState<OpenItem | null>(null);
  const [pairingType, setPairingType] = useState<"receipt" | "payment">(
    movement.amount > 0 ? "receipt" : "payment"
  );

  // Filter open items based on pairing type
  const relevantItems = openItems.filter((item) => {
    if (pairingType === "receipt") {
      return item.accountCode === "311" && item.remainingAmount > 0;
    } else {
      return item.accountCode === "321" && item.remainingAmount > 0;
    }
  });

  const [validationResult, setValidationResult] = useState<RuleResult | null>(null);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [pairingNote, setPairingNote] = useState("");

  const handlePair = async (overrideWarnings = false) => {
    if (!selectedItem) {
      alert("Vyberte položku na spárovanie");
      return;
    }

    // Run validation
    const companyId = getCompanyId();
    const isPartial = Math.abs(movement.amount) < selectedItem.remainingAmount - 0.01;
    
    const pairingData: BankPairingData = {
      movementAmount: movement.amount,
      openItemAmount: selectedItem.amount,
      openItemRemaining: selectedItem.remainingAmount,
      partnerId: selectedItem.partnerId,
      note: pairingNote,
      isPartialPayment: isPartial,
    };
    
    const result = await validateEntity("BANK_PAIRING", pairingData, { companyId });
    
    // If there are blocks, show modal and stop
    if (result.blocks.length > 0) {
      setValidationResult(result);
      setShowValidationModal(true);
      return;
    }
    
    // If there are warnings and not overriding, show modal
    if (result.warnings.length > 0 && !overrideWarnings) {
      setValidationResult(result);
      setShowValidationModal(true);
      return;
    }
    
    // Log override if warnings were bypassed
    if (overrideWarnings && result.warnings.length > 0) {
      await logAuditEntry(companyId, {
        type: "OVERRIDE_WARNING",
        ruleCodes: result.warnings.map((w) => w.code),
        entityType: "BANK_PAIRING",
        ref: { transactionId: movement.transactionId },
        by: userId,
        notes: `Párovanie platby napriek ${result.warnings.length} upozorneniam`,
      });
    }

    setSaving(true);
    try {
      // Find appropriate template
      const templateCode = pairingType === "receipt" ? "UHRADA_ODBERATEL" : "UHRADA_DODAVATEL";
      const template = templates.find((t) => t.code === templateCode);
      
      if (!template) {
        alert("Šablóna pre párovanie nebola nájdená");
        setSaving(false);
        return;
      }

      await createTransactionFromTemplate({
        template,
        amount: Math.abs(movement.amount),
        date: movement.date.toDate(),
        description: `Párovanie: ${movement.description}`,
        partnerId: selectedItem.partnerId,
        partnerName: selectedItem.partnerName,
      }, userId, "POSTED");

      onSuccess();
    } catch (err) {
      console.error("Pairing failed:", err);
      alert("Nepodarilo sa spárovať platbu");
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-900">Spárovať platbu</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Movement info */}
          <div className="bg-slate-50 rounded-xl p-4">
            <div className="text-sm text-slate-500 mb-1">Bankový pohyb</div>
            <div className="font-semibold text-slate-900">{movement.description}</div>
            <div className={`text-lg font-bold ${movement.amount > 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {formatEUR(movement.amount)}
            </div>
          </div>

          {/* Pairing type */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Typ párovania</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPairingType("receipt")}
                className={`flex-1 px-4 py-2 rounded-xl font-medium transition-colors ${
                  pairingType === "receipt"
                    ? "bg-emerald-100 text-emerald-700 border-2 border-emerald-300"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                Úhrada od odberateľa (311)
              </button>
              <button
                type="button"
                onClick={() => setPairingType("payment")}
                className={`flex-1 px-4 py-2 rounded-xl font-medium transition-colors ${
                  pairingType === "payment"
                    ? "bg-purple-100 text-purple-700 border-2 border-purple-300"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                Úhrada dodávateľovi (321)
              </button>
            </div>
          </div>

          {/* Open items */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Otvorené položky ({relevantItems.length})
            </label>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {relevantItems.map((item) => (
                <div
                  key={`${item.partnerId}-${item.accountCode}`}
                  onClick={() => setSelectedItem(item)}
                  className={`p-3 rounded-xl cursor-pointer transition-colors ${
                    selectedItem?.partnerId === item.partnerId && selectedItem?.accountCode === item.accountCode
                      ? "bg-slate-900 text-white"
                      : "bg-slate-50 hover:bg-slate-100"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{item.partnerName}</div>
                      <div className={`text-sm ${
                        selectedItem?.partnerId === item.partnerId ? "text-slate-300" : "text-slate-500"
                      }`}>
                        {item.description}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-semibold">{formatEUR(item.remainingAmount)}</div>
                      <div className={`text-xs ${
                        selectedItem?.partnerId === item.partnerId ? "text-slate-300" : "text-slate-500"
                      }`}>
                        zostáva
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {relevantItems.length === 0 && (
                <div className="p-4 text-center text-slate-500">
                  Žiadne otvorené položky
                </div>
              )}
            </div>
          </div>

          {/* Note for partial payment */}
          {selectedItem && Math.abs(movement.amount) < selectedItem.remainingAmount - 0.01 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="text-amber-500 mt-0.5" />
                <div className="flex-1">
                  <div className="font-medium text-amber-800 text-sm">Čiastočná úhrada</div>
                  <div className="text-amber-700 text-sm">Suma úhrady je menšia ako zostatok. Pridajte poznámku.</div>
                  <input
                    type="text"
                    value={pairingNote}
                    onChange={(e) => setPairingNote(e.target.value)}
                    placeholder="Napr. Záloha, Splátka 1/3..."
                    className="mt-2 w-full px-3 py-2 rounded-lg border border-amber-200 text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50"
            >
              Zrušiť
            </button>
            <button
              onClick={() => handlePair(false)}
              disabled={saving || !selectedItem}
              className="flex-1 px-4 py-3 rounded-xl bg-slate-900 text-white font-medium hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? "Párujem..." : "Spárovať"}
            </button>
          </div>
        </div>

        {/* Validation Modal */}
        {showValidationModal && validationResult && (
          <ValidationModal
            result={validationResult}
            onClose={() => setShowValidationModal(false)}
            onProceed={validationResult.blocks.length === 0 ? () => {
              setShowValidationModal(false);
              handlePair(true);
            } : undefined}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// TATRA BANKA SETTINGS MODAL
// ============================================================================

function TatraBankaSettingsModal({
  credentials,
  onSave,
  onClose,
}: {
  credentials: TatraBankaCredentials | null;
  onSave: (creds: TatraBankaCredentials) => void;
  onClose: () => void;
}) {
  const [clientId, setClientId] = useState(credentials?.clientId || "");
  const [clientSecret, setClientSecret] = useState(credentials?.clientSecret || "");
  const [iban, setIban] = useState(credentials?.iban || "");
  const [redirectUri, setRedirectUri] = useState(
    credentials?.redirectUri || `${window.location.origin}/uctovnictvo/banka`
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ clientId, clientSecret, iban, redirectUri });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-900">Nastavenia Tatra Banka API</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              API Key / Client ID
            </label>
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="l7e62e91b317ac46818be34d0f07a8efe"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none font-mono text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Shared Secret / Client Secret
            </label>
            <input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder="••••••••••••••••"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none font-mono text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              IBAN účtu
            </label>
            <input
              type="text"
              value={iban}
              onChange={(e) => setIban(e.target.value.toUpperCase().replace(/\s/g, ""))}
              placeholder="SK0511000000002600000054"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none font-mono text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Redirect URI
            </label>
            <input
              type="text"
              value={redirectUri}
              onChange={(e) => setRedirectUri(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none text-sm"
            />
            <p className="mt-1 text-xs text-slate-500">
              Táto URL musí byť zaregistrovaná v Tatra Banka Developer Portáli
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50"
            >
              Zrušiť
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-3 rounded-xl bg-slate-900 text-white font-medium hover:bg-slate-800"
            >
              Uložiť
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// AUTO-PAIR MODAL
// ============================================================================

function AutoPairModal({
  matches,
  tbTransactions,
  onPair,
  onClose,
}: {
  matches: PairingMatch[];
  tbTransactions: TatraBankaTransaction[];
  onPair: (match: PairingMatch) => void;
  onClose: () => void;
}) {
  const [pairing, setPairing] = useState<string | null>(null);

  const handlePair = async (match: PairingMatch) => {
    setPairing(match.entry.id);
    await onPair(match);
    setPairing(null);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Auto-párovanie platieb</h2>
            <p className="text-sm text-slate-500">
              Nájdených {tbTransactions.length} transakcií, {matches.length} návrhov na párovanie
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3">
          {matches.map((match) => (
            <div
              key={`${match.bankTransaction.id}-${match.entry.id}`}
              className="border border-slate-200 rounded-xl p-4 hover:border-slate-300"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      match.confidence >= 70 ? "bg-emerald-100 text-emerald-700" :
                      match.confidence >= 50 ? "bg-amber-100 text-amber-700" :
                      "bg-slate-100 text-slate-600"
                    }`}>
                      {match.confidence}% zhoda
                    </span>
                    {match.matchReasons.map((reason, i) => (
                      <span key={i} className="px-2 py-0.5 rounded bg-blue-50 text-blue-600 text-xs">
                        {reason}
                      </span>
                    ))}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-slate-500 text-xs mb-1">Bankový pohyb</div>
                      <div className="font-medium">{match.bankTransaction.counterpartyName || "—"}</div>
                      <div className="text-slate-600">{match.bankTransaction.description}</div>
                      <div className={`font-mono font-semibold ${
                        match.bankTransaction.type === "CREDIT" ? "text-emerald-600" : "text-rose-600"
                      }`}>
                        {match.bankTransaction.type === "CREDIT" ? "+" : "-"}
                        {formatEUR(match.bankTransaction.amount)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 text-xs mb-1">Doklad v systéme</div>
                      <div className="font-medium">{match.entry.partnerSnapshot?.name || "—"}</div>
                      <div className="text-slate-600">{match.entry.description || match.entry.docNumber}</div>
                      <div className={`font-mono font-semibold ${
                        match.entry.type === "INCOME" ? "text-emerald-600" : "text-rose-600"
                      }`}>
                        {match.entry.type === "INCOME" ? "+" : "-"}
                        {formatEUR(match.entry.amount)}
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handlePair(match)}
                  disabled={pairing === match.entry.id}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm font-medium whitespace-nowrap"
                >
                  {pairing === match.entry.id ? "Párujem..." : "Spárovať"}
                </button>
              </div>
            </div>
          ))}

          {matches.length === 0 && (
            <div className="text-center py-8 text-slate-500">
              Žiadne návrhy na párovanie
            </div>
          )}
        </div>

        <div className="flex justify-end mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50"
          >
            Zavrieť
          </button>
        </div>
      </div>
    </div>
  );
}
