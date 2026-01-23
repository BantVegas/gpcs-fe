// src/pages/Entries.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { Timestamp } from "firebase/firestore";
import {
  Plus,
  Search,
  Download,
  Upload,
  Pencil,
  Trash2,
  Check,
  X,
  BookOpen,
} from "lucide-react";
import { useUser } from "@/components/AuthGate";
import {
  subscribeToEntries,
  subscribeToPartners,
  subscribeToUploads,
  createEntry,
  updateEntry,
  deleteEntry,
  createUpload,
  deleteUpload,
  lookupCompanyByICO,
  createPartner,
  extractInvoiceFromUpload,
  createEntryFromExtractedData,
} from "@/lib/firebaseServices";
import { formatEUR } from "@/lib/taxEngine";
import type { Entry, Partner, EntryType, PaymentStatus, PaymentMethodType, PartnerSnapshot, Upload as UploadType } from "@/lib/schemas";
import { CATEGORIES } from "@/lib/schemas";
import { validateEntity, logAuditEntry, type RuleResult, type DocumentData } from "@/lib/ruleEngine";
import { ValidationModal } from "@/components/HelpTip";

function getCompanyId(): string {
  const stored = localStorage.getItem("gpcs-company-id");
  return stored || "gpcs";
}

interface EntriesProps {
  type: EntryType;
}

export default function Entries({ type }: EntriesProps) {
  const user = useUser();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [accountedEntryIds, setAccountedEntryIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [yearFilter, setYearFilter] = useState<number>(new Date().getFullYear());
  const [monthFilter, setMonthFilter] = useState<number | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | "all">("all");
  const [showForm, setShowForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ loading: boolean; message: string }>({ loading: false, message: "" });
  const [uploads, setUploads] = useState<UploadType[]>([]);
  const [extractingId, setExtractingId] = useState<string | null>(null);

  useEffect(() => {
    const unsubEntries = subscribeToEntries((e) => {
      setEntries(e.filter((entry) => entry.type === type));
      setLoading(false);
    }, { type });
    const unsubPartners = subscribeToPartners(setPartners);
    const unsubUploads = subscribeToUploads(setUploads);
    
    // Load accounted entry IDs from transactions
    const loadAccountedEntries = async () => {
      const companyId = getCompanyId();
      const { collection, getDocs } = await import("firebase/firestore");
      const { db } = await import("@/firebase");
      const transactionsRef = collection(db, "companies", companyId, "transactions");
      const snap = await getDocs(transactionsRef);
      const ids = new Set<string>();
      snap.docs.forEach((d) => {
        const data = d.data();
        if (data.sourceEntryId) {
          ids.add(data.sourceEntryId);
        }
      });
      setAccountedEntryIds(ids);
    };
    loadAccountedEntries();

    return () => {
      unsubEntries();
      unsubPartners();
      unsubUploads();
    };
  }, [type]);

  const filteredEntries = useMemo(() => {
    let result = entries;

    if (yearFilter) {
      result = result.filter((e) => {
        const date = e.date instanceof Timestamp ? e.date.toDate() : new Date(e.date);
        return date.getFullYear() === yearFilter;
      });
    }

    if (monthFilter !== "all") {
      result = result.filter((e) => {
        const date = e.date instanceof Timestamp ? e.date.toDate() : new Date(e.date);
        return date.getMonth() === monthFilter;
      });
    }

    if (categoryFilter !== "all") {
      result = result.filter((e) => e.category === categoryFilter);
    }

    if (statusFilter !== "all") {
      result = result.filter((e) => e.payment.status === statusFilter);
    }

    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter((e) =>
        e.description?.toLowerCase().includes(q) ||
        e.docNumber?.toLowerCase().includes(q) ||
        e.partnerSnapshot?.name?.toLowerCase().includes(q) ||
        e.category?.toLowerCase().includes(q)
      );
    }

    return result;
  }, [entries, yearFilter, monthFilter, categoryFilter, statusFilter, query]);

  const totals = useMemo(() => {
    const total = filteredEntries.reduce((sum, e) => sum + e.amount, 0);
    const paid = filteredEntries.filter((e) => e.payment.status === "PAID").reduce((sum, e) => sum + e.amount, 0);
    const unpaid = filteredEntries.filter((e) => e.payment.status !== "PAID").reduce((sum, e) => sum + e.amount, 0);
    return { total, paid, unpaid, count: filteredEntries.length };
  }, [filteredEntries]);

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];
  }, []);

  const months = [
    { value: "all", label: "Vsetky mesiace" },
    { value: 0, label: "Januar" },
    { value: 1, label: "Februar" },
    { value: 2, label: "Marec" },
    { value: 3, label: "April" },
    { value: 4, label: "Maj" },
    { value: 5, label: "Jun" },
    { value: 6, label: "Jul" },
    { value: 7, label: "August" },
    { value: 8, label: "September" },
    { value: 9, label: "Oktober" },
    { value: 10, label: "November" },
    { value: 11, label: "December" },
  ];

  const categories = type === "INCOME" ? CATEGORIES.INCOME : CATEGORIES.EXPENSE;

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (!user) {
      alert("Musite byt prihlaseny");
      return;
    }
    
    const files = Array.from(e.dataTransfer.files);
    const validFiles = files.filter((f) =>
      f.type === "application/pdf" ||
      f.type.startsWith("image/")
    );

    if (validFiles.length === 0) {
      alert("Podporovane su len PDF a obrazky (JPG, PNG)");
      return;
    }

    setUploadStatus({ loading: true, message: `Nahravam ${validFiles.length} suborov...` });

    let successCount = 0;
    for (const file of validFiles) {
      try {
        await createUpload(file, user.uid);
        successCount++;
      } catch (err: any) {
        console.error("Upload failed:", err);
        alert(`Chyba pri nahravani ${file.name}: ${err?.message || "Neznama chyba"}`);
      }
    }

    setUploadStatus({ loading: false, message: successCount > 0 ? `Nahrane ${successCount} suborov` : "" });
    
    if (successCount > 0) {
      setTimeout(() => setUploadStatus({ loading: false, message: "" }), 3000);
    }
  }, [user]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Naozaj chcete zmazat tento zaznam?")) return;
    await deleteEntry(id);
  };

  const handleMarkPaid = async (entry: Entry) => {
    await updateEntry(entry.id, {
      payment: {
        ...entry.payment,
        status: "PAID",
        paidAt: Timestamp.now(),
      },
    });
  };

  const handleCreateTransaction = async (entry: Entry) => {
    if (!user) return;
    
    const companyId = getCompanyId();
    const entryDate = entry.date instanceof Timestamp ? entry.date.toDate() : new Date(entry.date);
    const period = `${entryDate.getFullYear()}-${String(entryDate.getMonth() + 1).padStart(2, "0")}`;
    
    // Determine accounts based on entry type and category
    let debitAccount: string;
    let creditAccount: string;
    let debitAccountName: string;
    let creditAccountName: string;
    
    if (type === "INCOME") {
      // Income: MD 311 (Pohľadávky) / D 6xx (Výnosy)
      debitAccount = "311";
      debitAccountName = "Pohľadávky z obchodného styku";
      // Map category to revenue account
      const revenueAccounts: Record<string, { code: string; name: string }> = {
        "Služby": { code: "602", name: "Tržby z predaja služieb" },
        "Tovar": { code: "604", name: "Tržby z predaja tovaru" },
        "Výrobky": { code: "601", name: "Tržby z predaja vlastných výrobkov" },
        "Ostatné": { code: "648", name: "Ostatné výnosy z hospodárskej činnosti" },
      };
      const revenue = revenueAccounts[entry.category] || revenueAccounts["Služby"];
      creditAccount = revenue.code;
      creditAccountName = revenue.name;
    } else {
      // Expense: MD 5xx (Náklady) / D 321 (Záväzky)
      creditAccount = "321";
      creditAccountName = "Záväzky z obchodného styku";
      // Map category to expense account
      const expenseAccounts: Record<string, { code: string; name: string }> = {
        "Materiál": { code: "501", name: "Spotreba materiálu" },
        "Energie": { code: "502", name: "Spotreba energie" },
        "Služby": { code: "518", name: "Ostatné služby" },
        "Nájom": { code: "518", name: "Ostatné služby" },
        "Marketing": { code: "518", name: "Ostatné služby" },
        "Cestovné": { code: "512", name: "Cestovné" },
        "Telefón": { code: "518", name: "Ostatné služby" },
        "Poistenie": { code: "548", name: "Ostatné náklady na hospodársku činnosť" },
        "Opravy": { code: "511", name: "Opravy a udržiavanie" },
        "Ostatné": { code: "548", name: "Ostatné náklady na hospodársku činnosť" },
      };
      const expense = expenseAccounts[entry.category] || expenseAccounts["Služby"];
      debitAccount = expense.code;
      debitAccountName = expense.name;
    }
    
    // Create transaction document
    const { addDoc, collection } = await import("firebase/firestore");
    const { db } = await import("@/firebase");
    
    const transactionData = {
      number: `${type === "INCOME" ? "VF" : "PF"}-${Date.now()}`,
      date: entry.date,
      period,
      description: entry.description || `${type === "INCOME" ? "Faktúra vydaná" : "Faktúra prijatá"} - ${entry.partnerSnapshot?.name || ""}`,
      status: "POSTED",
      postedAt: Timestamp.now(),
      postedBy: user.uid,
      lines: [
        {
          accountCode: debitAccount,
          accountName: debitAccountName,
          side: "MD",
          amount: entry.amount,
          partnerId: entry.partnerId || null,
          partnerName: entry.partnerSnapshot?.name || null,
        },
        {
          accountCode: creditAccount,
          accountName: creditAccountName,
          side: "D",
          amount: entry.amount,
          partnerId: entry.partnerId || null,
          partnerName: entry.partnerSnapshot?.name || null,
        },
      ],
      totalMd: entry.amount,
      totalD: entry.amount,
      sourceEntryId: entry.id,
      sourceEntryType: type,
      createdAt: Timestamp.now(),
      createdBy: user.uid,
    };
    
    try {
      const transactionsRef = collection(db, "companies", companyId, "transactions");
      await addDoc(transactionsRef, transactionData);
      
      // Update local state to show as accounted
      setAccountedEntryIds((prev) => new Set([...prev, entry.id]));
      
      alert(`Transakcia vytvorená!\n\nMD ${debitAccount} ${debitAccountName}\nD ${creditAccount} ${creditAccountName}\nSuma: ${formatEUR(entry.amount)}`);
    } catch (err: any) {
      console.error("Failed to create transaction:", err);
      alert(`Chyba pri vytváraní transakcie: ${err?.message || "Neznáma chyba"}`);
    }
  };

  const [validationResult, setValidationResult] = useState<RuleResult | null>(null);
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<UploadType | null>(null);
  const [pendingExtractedData, setPendingExtractedData] = useState<any>(null);

  const handleExtractAndCreate = async (upload: UploadType) => {
    if (!user) return;
    
    const companyId = getCompanyId();
    setExtractingId(upload.id);
    
    try {
      // First extract data from upload using AI
      const extractResult = await extractInvoiceFromUpload(upload.id);
      
      if (!extractResult.success || !extractResult.data) {
        alert("Nepodarilo sa extrahovat data z faktury");
        setExtractingId(null);
        return;
      }
      
      const extractedData = extractResult.data;
      
      // Now validate the extracted data
      const docData: DocumentData = {
        amount: extractedData?.amount || 0,
        issueDate: extractedData?.issueDate || null,
        partnerName: extractedData?.supplierName || "",
        partnerIco: extractedData?.supplierIco || "",
        docNumber: extractedData?.invoiceNumber || "",
        confidence: extractedData?.confidence || 0,
        status: "READY",
      };
      
      const result = await validateEntity("DOCUMENT", docData, { companyId });
      
      // If there are blocks, show modal and stop
      if (result.blocks.length > 0) {
        setValidationResult(result);
        setShowValidationModal(true);
        setPendingUpload(upload);
        setPendingExtractedData(extractedData);
        setExtractingId(null);
        return;
      }
      
      // If there are warnings, show modal
      if (result.warnings.length > 0) {
        setValidationResult(result);
        setShowValidationModal(true);
        setPendingUpload(upload);
        setPendingExtractedData(extractedData);
        setExtractingId(null);
        return;
      }
      
      // No issues - create entry directly
      await createEntryFromExtractedData(upload.id, extractedData, user.uid, type);
      alert("Zaznam uspesne vytvoreny z faktury!");
      
    } catch (err: any) {
      console.error("Extraction failed:", err);
      alert(`Chyba: ${err?.message || "Neznama chyba"}`);
    } finally {
      setExtractingId(null);
    }
  };
  
  const handleProceedWithWarnings = async () => {
    if (!user || !pendingUpload || !pendingExtractedData) return;
    
    const companyId = getCompanyId();
    
    // Log override
    if (validationResult && validationResult.warnings.length > 0) {
      await logAuditEntry(companyId, {
        type: "OVERRIDE_WARNING",
        ruleCodes: validationResult.warnings.map((w) => w.code),
        entityType: "DOCUMENT",
        ref: { documentId: pendingUpload.id },
        by: user.uid,
        notes: `Spracovanie dokladu napriek ${validationResult.warnings.length} upozorneniam`,
      });
    }
    
    try {
      // Create entry from already extracted data
      await createEntryFromExtractedData(pendingUpload.id, pendingExtractedData, user.uid, type);
      alert("Zaznam uspesne vytvoreny z faktury!");
    } catch (err: any) {
      console.error("Create entry failed:", err);
      alert(`Chyba: ${err?.message || "Neznama chyba"}`);
    }
    
    setShowValidationModal(false);
    setPendingUpload(null);
    setPendingExtractedData(null);
  };

  const exportCSV = () => {
    const header = ["Datum", "Cislo dokladu", "Partner", "Kategoria", "Popis", "Suma", "Status"];
    const rows = filteredEntries.map((e) => {
      const date = e.date instanceof Timestamp ? e.date.toDate() : new Date(e.date);
      return [
        date.toISOString().slice(0, 10),
        e.docNumber || "",
        e.partnerSnapshot?.name || "",
        e.category,
        e.description,
        e.amount.toFixed(2).replace(".", ","),
        e.payment.status,
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";");
    });
    
    const csv = [header.join(";"), ...rows].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${type.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
            {type === "INCOME" ? "Prijmy" : "Vydavky"}
          </h1>
          <p className="text-slate-500 mt-1">
            {totals.count} zaznamov, spolu {formatEUR(totals.total)}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => { setEditingEntry(null); setShowForm(true); }}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all ${
              type === "INCOME"
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : "bg-rose-600 text-white hover:bg-rose-700"
            }`}
          >
            <Plus size={18} />
            Novy {type === "INCOME" ? "prijem" : "vydavok"}
          </button>
          <button
            onClick={exportCSV}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all"
          >
            <Download size={18} />
            Export CSV
          </button>
        </div>
      </div>

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all ${
          isDragging
            ? "border-slate-900 bg-slate-50"
            : uploadStatus.loading
            ? "border-blue-500 bg-blue-50"
            : uploadStatus.message
            ? "border-emerald-500 bg-emerald-50"
            : "border-slate-200 hover:border-slate-300"
        }`}
      >
        {uploadStatus.loading ? (
          <>
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3" />
            <p className="text-sm text-blue-600 font-medium">{uploadStatus.message}</p>
          </>
        ) : uploadStatus.message ? (
          <>
            <Check className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
            <p className="text-sm text-emerald-600 font-medium">{uploadStatus.message}</p>
          </>
        ) : (
          <>
            <Upload className="w-10 h-10 text-slate-400 mx-auto mb-3" />
            <p className="text-sm text-slate-600 font-medium">
              Pretiahnite sem faktury alebo uctenky (PDF, JPG, PNG)
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Subory budu nahrane do uschovy
            </p>
          </>
        )}
      </div>

      {uploads.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
          <h3 className="font-semibold text-slate-900 mb-3">Nahrane subory ({uploads.length})</h3>
          <div className="space-y-2">
            {uploads.slice(0, 10).map((upload) => (
              <div key={upload.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-slate-200 rounded flex items-center justify-center">
                    {upload.mime?.startsWith("image/") ? "🖼️" : "📄"}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{upload.fileName}</p>
                    <p className="text-xs text-slate-500">
                      {(upload.size / 1024).toFixed(1)} KB • {upload.status}
                      {upload.extractedData && " • Extrahované"}
                      {upload.entryId && " • Spracované"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {upload.downloadUrl && (
                    <a
                      href={upload.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline"
                    >
                      Zobrazit
                    </a>
                  )}
                  {upload.status === "UPLOADED" && !upload.entryId && (
                    <button
                      onClick={() => handleExtractAndCreate(upload)}
                      disabled={extractingId === upload.id}
                      className="px-3 py-1 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {extractingId === upload.id ? "Spracovavam..." : "Spracovat"}
                    </button>
                  )}
                  {upload.status === "EXTRACTED" && !upload.entryId && (
                    <button
                      onClick={() => upload.extractedData && createEntryFromExtractedData(upload.id, upload.extractedData, user?.uid || "", type)}
                      className="px-3 py-1 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Vytvorit zaznam
                    </button>
                  )}
                  {upload.status === "PROCESSING" && (
                    <span className="text-sm text-amber-600">Spracovava sa...</span>
                  )}
                  {upload.status === "ERROR" && (
                    <span className="text-sm text-red-600" title={upload.error}>Chyba</span>
                  )}
                  {upload.entryId && (
                    <span className="text-sm text-green-600">✓ Hotovo</span>
                  )}
                  <button
                    onClick={async () => {
                      if (confirm("Naozaj chcete zmazat tento subor?")) {
                        await deleteUpload(upload.id);
                      }
                    }}
                    className="p-1 text-red-500 hover:text-red-700"
                    title="Zmazat"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            {uploads.length > 10 && (
              <p className="text-sm text-slate-500 text-center">...a {uploads.length - 10} dalsich</p>
            )}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-slate-100">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Hladat..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none text-sm"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={yearFilter}
                onChange={(e) => setYearFilter(Number(e.target.value))}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-slate-900"
              >
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <select
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-slate-900"
              >
                {months.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-slate-900"
              >
                <option value="all">Vsetky kategorie</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as PaymentStatus | "all")}
                className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-1 focus:ring-slate-900"
              >
                <option value="all">Vsetky statusy</option>
                <option value="PAID">Uhradene</option>
                <option value="UNPAID">Neuhradene</option>
                <option value="PARTIAL">Ciastocne</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 mt-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Spolu:</span>
              <span className="font-semibold">{formatEUR(totals.total)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Uhradene:</span>
              <span className="font-semibold text-emerald-600">{formatEUR(totals.paid)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Neuhradene:</span>
              <span className="font-semibold text-amber-600">{formatEUR(totals.unpaid)}</span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50">
                <th className="text-left text-xs font-medium text-slate-500 uppercase px-6 py-3">Datum</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase px-6 py-3">Doklad</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase px-6 py-3">Partner</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase px-6 py-3">Kategoria</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase px-6 py-3">Popis</th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase px-6 py-3">Suma</th>
                <th className="text-center text-xs font-medium text-slate-500 uppercase px-6 py-3">Status</th>
                <th className="text-right text-xs font-medium text-slate-500 uppercase px-6 py-3">Akcie</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEntries.map((entry) => {
                const date = entry.date instanceof Timestamp ? entry.date.toDate() : new Date(entry.date);
                return (
                  <tr key={entry.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {date.toLocaleDateString("sk-SK")}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">
                      {entry.docNumber || "—"}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {entry.partnerSnapshot?.name || "—"}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      <span className="px-2 py-1 rounded-full bg-slate-100 text-xs">
                        {entry.category}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate">
                      {entry.description}
                    </td>
                    <td className={`px-6 py-4 text-sm font-semibold text-right ${
                      type === "INCOME" ? "text-emerald-600" : "text-rose-600"
                    }`}>
                      {type === "INCOME" ? "+" : "-"}{formatEUR(entry.amount)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                        entry.payment.status === "PAID"
                          ? "bg-emerald-100 text-emerald-700"
                          : entry.payment.status === "PARTIAL"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-slate-100 text-slate-700"
                      }`}>
                        {entry.payment.status === "PAID" && <Check size={12} />}
                        {entry.payment.status === "PAID" ? "Uhradene" : entry.payment.status === "PARTIAL" ? "Ciastocne" : "Neuhradene"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {accountedEntryIds.has(entry.id) ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-emerald-600 bg-emerald-50 rounded-lg">
                            <Check size={14} />
                            Zaúčtované
                          </span>
                        ) : (
                          <button
                            onClick={() => handleCreateTransaction(entry)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                            title="Zaúčtovať do podvojného účtovníctva"
                          >
                            <BookOpen size={14} />
                            Zaúčtovať
                          </button>
                        )}
                        {entry.payment.status !== "PAID" && (
                          <button
                            onClick={() => handleMarkPaid(entry)}
                            className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg"
                            title="Oznacit ako uhradene"
                          >
                            <Check size={16} />
                          </button>
                        )}
                        <button
                          onClick={() => { setEditingEntry(entry); setShowForm(true); }}
                          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(entry.id)}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredEntries.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                    Ziadne zaznamy
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <EntryForm
          type={type}
          entry={editingEntry}
          partners={partners}
          onClose={() => { setShowForm(false); setEditingEntry(null); }}
        />
      )}

      {/* Validation Modal */}
      {showValidationModal && validationResult && (
        <ValidationModal
          result={validationResult}
          onClose={() => {
            setShowValidationModal(false);
            setPendingUpload(null);
            setPendingExtractedData(null);
          }}
          onProceed={validationResult.blocks.length === 0 && pendingUpload && pendingExtractedData ? () => handleProceedWithWarnings() : undefined}
        />
      )}
    </div>
  );
}

function EntryForm({
  type,
  entry,
  onClose,
}: {
  type: EntryType;
  entry: Entry | null;
  partners: Partner[];
  onClose: () => void;
}) {
  const user = useUser();
  const [saving, setSaving] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);

  const [date, setDate] = useState(
    entry?.date instanceof Timestamp
      ? entry.date.toDate().toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10)
  );
  const [amount, setAmount] = useState(entry?.amount?.toString() || "");
  const [currency, setCurrency] = useState<"EUR" | "USD" | "CZK" | "GBP" | "PLN" | "HUF" | "CHF">(entry?.currency || "EUR");
  const [category, setCategory] = useState(entry?.category || (type === "INCOME" ? CATEGORIES.INCOME[0] : CATEGORIES.EXPENSE[0]));
  const [description, setDescription] = useState(entry?.description || "");
  const [docNumber, setDocNumber] = useState(entry?.docNumber || "");
  const [partnerIco, setPartnerIco] = useState(entry?.partnerSnapshot?.ico || "");
  const [partnerName, setPartnerName] = useState(entry?.partnerSnapshot?.name || "");
  const [partnerId, setPartnerId] = useState(entry?.partnerId || "");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(entry?.payment?.status || "UNPAID");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>(entry?.payment?.method || "BANK_TRANSFER");
  const [vs, setVs] = useState(entry?.payment?.vs || "");
  const [iban, setIban] = useState(entry?.payment?.iban || "");
  const [deductibleEnabled, setDeductibleEnabled] = useState(entry?.deductible?.enabled ?? true);
  const [deductiblePercent, setDeductiblePercent] = useState(entry?.deductible?.percent?.toString() || "100");

  const categories = type === "INCOME" ? CATEGORIES.INCOME : CATEGORIES.EXPENSE;

  const handleLookupICO = async () => {
    if (!partnerIco || partnerIco.length < 8) return;
    setLookingUp(true);
    try {
      const result = await lookupCompanyByICO(partnerIco);
      if (result) {
        setPartnerName(result.name || "");
        if (result.id) {
          setPartnerId(result.id);
        }
      }
    } catch (err) {
      console.error("ICO lookup failed:", err);
    }
    setLookingUp(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const parsedAmount = parseFloat(amount.replace(",", "."));
    if (!parsedAmount || parsedAmount <= 0) {
      alert("Zadajte platnu sumu");
      return;
    }

    setSaving(true);
    try {
      let finalPartnerId = partnerId;
      const partnerSnapshot: PartnerSnapshot = {
        name: partnerName,
        ico: partnerIco,
      };

      if (partnerIco && partnerName && !partnerId) {
        finalPartnerId = await createPartner({
          name: partnerName,
          ico: partnerIco,
          source: "MANUAL",
        });
      }

      const payment: any = {
        status: paymentStatus,
        method: paymentMethod,
        vs: vs || "",
        iban: iban || "",
      };
      if (paymentStatus === "PAID") {
        payment.paidAt = Timestamp.now();
      }

      const entryData: any = {
        type,
        date: Timestamp.fromDate(new Date(date)),
        amount: parsedAmount,
        currency,
        partnerSnapshot,
        category,
        description,
        docNumber: docNumber || "",
        payment,
        deductible: {
          enabled: deductibleEnabled,
          percent: parseFloat(deductiblePercent) || 100,
        },
        attachments: entry?.attachments || [],
        source: entry?.source || "MANUAL",
        createdBy: user.uid,
      };
      
      if (finalPartnerId) {
        entryData.partnerId = finalPartnerId;
      }

      if (entry) {
        await updateEntry(entry.id, entryData);
      } else {
        await createEntry(entryData);
      }

      onClose();
    } catch (err) {
      console.error("Save failed:", err);
      alert("Nepodarilo sa ulozit zaznam");
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-900">
            {entry ? "Upravit" : "Novy"} {type === "INCOME" ? "prijem" : "vydavok"}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Datum</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Suma</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none text-lg font-semibold"
                  required
                />
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as "EUR" | "USD" | "CZK" | "GBP" | "PLN" | "HUF" | "CHF")}
                  className="w-24 px-3 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none font-medium"
                >
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="CZK">CZK</option>
                  <option value="GBP">GBP</option>
                  <option value="PLN">PLN</option>
                  <option value="HUF">HUF</option>
                  <option value="CHF">CHF</option>
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Kategoria</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Cislo dokladu</label>
              <input
                type="text"
                placeholder="F2026-001"
                value={docNumber}
                onChange={(e) => setDocNumber(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Popis</label>
            <input
              type="text"
              placeholder="Popis transakcie"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
            />
          </div>

          <div className="border-t border-slate-100 pt-4">
            <h3 className="font-medium text-slate-700 mb-3">Partner</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ICO</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="12345678"
                    value={partnerIco}
                    onChange={(e) => setPartnerIco(e.target.value.replace(/\D/g, "").slice(0, 8))}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleLookupICO}
                    disabled={lookingUp || partnerIco.length < 8}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                  >
                    {lookingUp ? "..." : "Hladat"}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nazov</label>
                <input
                  type="text"
                  placeholder="Nazov firmy"
                  value={partnerName}
                  onChange={(e) => setPartnerName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <h3 className="font-medium text-slate-700 mb-3">Platba</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                <select
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                >
                  <option value="UNPAID">Neuhradene</option>
                  <option value="PAID">Uhradene</option>
                  <option value="PARTIAL">Ciastocne uhradene</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Sposob</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethodType)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                >
                  <option value="BANK_TRANSFER">Prevod</option>
                  <option value="CASH">Hotovost</option>
                  <option value="CARD">Karta</option>
                  <option value="OTHER">Ine</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Variabilny symbol</label>
                <input
                  type="text"
                  placeholder="VS"
                  value={vs}
                  onChange={(e) => setVs(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">IBAN</label>
                <input
                  type="text"
                  placeholder="SK..."
                  value={iban}
                  onChange={(e) => setIban(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
                />
              </div>
            </div>
          </div>

          {type === "EXPENSE" && (
            <div className="border-t border-slate-100 pt-4">
              <h3 className="font-medium text-slate-700 mb-3">Odpocitatelnost</h3>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={deductibleEnabled}
                    onChange={(e) => setDeductibleEnabled(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm">Danovo odpocitatelne</span>
                </label>
                {deductibleEnabled && (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={deductiblePercent}
                      onChange={(e) => setDeductiblePercent(e.target.value)}
                      className="w-20 px-3 py-2 rounded-lg border border-slate-200 text-sm"
                    />
                    <span className="text-sm text-slate-500">%</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-slate-700 font-medium hover:bg-slate-50"
            >
              Zrusit
            </button>
            <button
              type="submit"
              disabled={saving}
              className={`flex-1 px-4 py-3 rounded-xl text-white font-medium disabled:opacity-50 ${
                type === "INCOME"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-rose-600 hover:bg-rose-700"
              }`}
            >
              {saving ? "Ukladam..." : entry ? "Ulozit" : "Pridat"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
