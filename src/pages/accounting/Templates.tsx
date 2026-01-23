// src/pages/accounting/Templates.tsx
import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, X, Play } from "lucide-react";
import { db } from "@/firebase";
import { collection, getDocs, doc, updateDoc, deleteDoc, Timestamp } from "firebase/firestore";
import { useUser } from "@/components/AuthGate";
import type { Account } from "@/lib/accountingSchemas";
import { 
  getTemplates, 
  saveTemplate, 
  applyTemplate,
  type ExtendedTemplate, 
  type ExtendedTemplateLine,
  type TemplateAppliesTo 
} from "@/lib/templateEngine";

function getCompanyId(): string {
  const stored = localStorage.getItem("gpcs-company-id");
  return stored || "gpcs";
}

const APPLIES_TO_OPTIONS: { value: TemplateAppliesTo; label: string }[] = [
  { value: "INVOICE_ISSUED", label: "Vystavená faktúra" },
  { value: "INVOICE_RECEIVED", label: "Prijatá faktúra" },
  { value: "BANK_RECEIPT", label: "Príjem na účet" },
  { value: "BANK_PAYMENT", label: "Výdaj z účtu" },
  { value: "PAYROLL", label: "Mzdy" },
  { value: "MANUAL", label: "Manuálne" },
];

function formatEUR(amount: number): string {
  return new Intl.NumberFormat("sk-SK", { style: "currency", currency: "EUR" }).format(amount);
}

export default function Templates() {
  useUser(); // Auth check
  const [templates, setTemplates] = useState<ExtendedTemplate[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ExtendedTemplate | null>(null);
  const [testingTemplate, setTestingTemplate] = useState<ExtendedTemplate | null>(null);
  const [testAmount, setTestAmount] = useState<number>(1000);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const companyId = getCompanyId();
    
    // Load accounts
    const accountsRef = collection(db, "companies", companyId, "chartOfAccounts");
    const accountsSnap = await getDocs(accountsRef);
    const loadedAccounts = accountsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Account));
    loadedAccounts.sort((a, b) => a.code.localeCompare(b.code));
    setAccounts(loadedAccounts);
    
    // Load templates
    const loadedTemplates = await getTemplates();
    loadedTemplates.sort((a, b) => a.code.localeCompare(b.code));
    setTemplates(loadedTemplates);
    
    setLoading(false);
  }

  const handleToggleEnabled = async (template: ExtendedTemplate) => {
    const companyId = getCompanyId();
    const ref = doc(db, "companies", companyId, "templates", template.id);
    await updateDoc(ref, {
      enabled: !template.enabled,
      updatedAt: Timestamp.now(),
    });
    await loadData();
  };

  const handleDelete = async (template: ExtendedTemplate) => {
    if (template.isSystem) {
      alert("Systémové šablóny nie je možné zmazať");
      return;
    }
    if (!confirm(`Naozaj chcete zmazať šablónu "${template.name}"?`)) return;
    
    const companyId = getCompanyId();
    const ref = doc(db, "companies", companyId, "templates", template.id);
    await deleteDoc(ref);
    await loadData();
  };

  const openForm = (template?: ExtendedTemplate) => {
    setEditingTemplate(template || null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingTemplate(null);
  };

  const openTest = (template: ExtendedTemplate) => {
    setTestingTemplate(template);
    setTestAmount(1000);
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
          <h1 className="text-2xl font-bold text-slate-900">Šablóny účtovania</h1>
          <p className="text-slate-500">Predpripravené šablóny pre automatické účtovanie dokladov</p>
        </div>
        <button
          onClick={() => openForm()}
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors"
        >
          <Plus size={20} />
          Nová šablóna
        </button>
      </div>

      {/* Templates list */}
      <div className="space-y-4">
        {templates.map((template) => (
          <div
            key={template.id}
            className={`bg-white rounded-2xl shadow-sm border p-5 ${
              template.enabled ? "border-slate-100" : "border-slate-200 opacity-60"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-sm bg-slate-100 px-2 py-0.5 rounded">{template.code}</span>
                  <h3 className="font-semibold text-slate-900">{template.name}</h3>
                  {template.isSystem && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Systémová</span>
                  )}
                </div>
                <p className="text-sm text-slate-600 mb-3">{template.description}</p>
                
                {/* Applies to badges */}
                <div className="flex flex-wrap gap-1 mb-3">
                  {template.appliesTo.map((type) => (
                    <span key={type} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                      {APPLIES_TO_OPTIONS.find((o) => o.value === type)?.label || type}
                    </span>
                  ))}
                </div>
                
                {/* Lines preview */}
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-xs font-medium text-slate-500 mb-2">Účtovanie:</div>
                  <div className="space-y-1">
                    {template.lines.map((line, i) => {
                      const account = accounts.find((a) => a.code === line.accountCode);
                      return (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <span className={`font-mono px-1.5 py-0.5 rounded text-xs ${
                            line.side === "MD" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"
                          }`}>
                            {line.side}
                          </span>
                          <span className="font-mono">{line.accountCode}</span>
                          <span className="text-slate-500">{account?.name || line.description}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              
              {/* Actions */}
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => handleToggleEnabled(template)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    template.enabled
                      ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {template.enabled ? "Aktívna" : "Neaktívna"}
                </button>
                <div className="flex gap-1">
                  <button
                    onClick={() => openTest(template)}
                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                    title="Testovať"
                  >
                    <Play size={16} />
                  </button>
                  <button
                    onClick={() => openForm(template)}
                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
                    title="Upraviť"
                  >
                    <Pencil size={16} />
                  </button>
                  {!template.isSystem && (
                    <button
                      onClick={() => handleDelete(template)}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                      title="Zmazať"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Template Form Modal */}
      {showForm && (
        <TemplateFormModal
          template={editingTemplate}
          accounts={accounts}
          onClose={closeForm}
          onSave={async () => {
            await loadData();
            closeForm();
          }}
        />
      )}

      {/* Test Template Modal */}
      {testingTemplate && (
        <TestTemplateModal
          template={testingTemplate}
          accounts={accounts}
          testAmount={testAmount}
          onAmountChange={setTestAmount}
          onClose={() => setTestingTemplate(null)}
        />
      )}
    </div>
  );
}

// ============================================================================
// TEMPLATE FORM MODAL
// ============================================================================

function TemplateFormModal({
  template,
  accounts,
  onClose,
  onSave,
}: {
  template: ExtendedTemplate | null;
  accounts: Account[];
  onClose: () => void;
  onSave: () => void;
}) {
  const user = useUser();
  const [saving, setSaving] = useState(false);
  const [code, setCode] = useState(template?.code || "");
  const [name, setName] = useState(template?.name || "");
  const [description, setDescription] = useState(template?.description || "");
  const [appliesTo, setAppliesTo] = useState<TemplateAppliesTo[]>(template?.appliesTo || ["MANUAL"]);
  const [lines, setLines] = useState<ExtendedTemplateLine[]>(
    template?.lines || [
      { id: "1", side: "MD", accountCode: "", amountSource: "TOTAL" },
      { id: "2", side: "D", accountCode: "", amountSource: "TOTAL" },
    ]
  );

  const addLine = () => {
    setLines([...lines, {
      id: Date.now().toString(),
      side: "MD",
      accountCode: "",
      amountSource: "TOTAL",
    }]);
  };

  const removeLine = (id: string) => {
    if (lines.length <= 2) return;
    setLines(lines.filter((l) => l.id !== id));
  };

  const updateLine = (id: string, field: keyof ExtendedTemplateLine, value: any) => {
    setLines(lines.map((l) => l.id === id ? { ...l, [field]: value } : l));
  };

  const toggleAppliesTo = (type: TemplateAppliesTo) => {
    if (appliesTo.includes(type)) {
      setAppliesTo(appliesTo.filter((t) => t !== type));
    } else {
      setAppliesTo([...appliesTo, type]);
    }
  };

  const handleSave = async () => {
    if (!code || !name) {
      alert("Vyplňte kód a názov šablóny");
      return;
    }
    if (lines.some((l) => !l.accountCode)) {
      alert("Vyplňte účty pre všetky riadky");
      return;
    }
    if (appliesTo.length === 0) {
      alert("Vyberte aspoň jeden typ dokladu");
      return;
    }

    setSaving(true);
    try {
      await saveTemplate({
        id: template?.id,
        code,
        name,
        description,
        appliesTo,
        lines,
        enabled: template?.enabled ?? true,
        isSystem: template?.isSystem ?? false,
        createdBy: user?.uid,
      });
      onSave();
    } catch (err) {
      console.error("Save failed:", err);
      alert("Nepodarilo sa uložiť šablónu");
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
            {template ? "Upraviť šablónu" : "Nová šablóna"}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Basic info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Kód</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))}
                disabled={!!template?.isSystem}
                placeholder="FA_VYDANA"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none disabled:bg-slate-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Názov</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Vystavená faktúra"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Popis</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Účtovanie vystavenej faktúry za služby"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
            />
          </div>

          {/* Applies to */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Použiť pre</label>
            <div className="flex flex-wrap gap-2">
              {APPLIES_TO_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggleAppliesTo(option.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    appliesTo.includes(option.value)
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Lines */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700">Riadky účtovania</label>
              <button
                type="button"
                onClick={addLine}
                className="text-sm text-slate-600 hover:text-slate-900"
              >
                + Pridať riadok
              </button>
            </div>
            <div className="space-y-2">
              {lines.map((line) => (
                <div key={line.id} className="flex gap-2 items-center bg-slate-50 p-2 rounded-lg">
                  <select
                    value={line.side}
                    onChange={(e) => updateLine(line.id, "side", e.target.value)}
                    className="w-16 px-2 py-2 rounded-lg border border-slate-200 text-sm font-mono"
                  >
                    <option value="MD">MD</option>
                    <option value="D">D</option>
                  </select>
                  <select
                    value={line.accountCode}
                    onChange={(e) => updateLine(line.id, "accountCode", e.target.value)}
                    className="flex-1 px-2 py-2 rounded-lg border border-slate-200 text-sm"
                  >
                    <option value="">Vyberte účet</option>
                    {accounts.filter((a) => a.isActive).map((a) => (
                      <option key={a.code} value={a.code}>{a.code} - {a.name}</option>
                    ))}
                  </select>
                  <select
                    value={line.amountSource}
                    onChange={(e) => updateLine(line.id, "amountSource", e.target.value)}
                    className="w-28 px-2 py-2 rounded-lg border border-slate-200 text-sm"
                  >
                    <option value="TOTAL">Celá suma</option>
                    <option value="CUSTOM">Vlastná</option>
                    <option value="PERCENT">Percento</option>
                  </select>
                  {line.amountSource === "PERCENT" && (
                    <input
                      type="number"
                      value={line.amountValue || ""}
                      onChange={(e) => updateLine(line.id, "amountValue", parseFloat(e.target.value))}
                      placeholder="%"
                      className="w-16 px-2 py-2 rounded-lg border border-slate-200 text-sm"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => removeLine(line.id)}
                    disabled={lines.length <= 2}
                    className="p-2 text-slate-400 hover:text-rose-600 disabled:opacity-30"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>

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
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-4 py-3 rounded-xl bg-slate-900 text-white font-medium hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? "Ukladám..." : "Uložiť"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// TEST TEMPLATE MODAL
// ============================================================================

function TestTemplateModal({
  template,
  accounts,
  testAmount,
  onAmountChange,
  onClose,
}: {
  template: ExtendedTemplate;
  accounts: Account[];
  testAmount: number;
  onAmountChange: (amount: number) => void;
  onClose: () => void;
}) {
  const draft = applyTemplate({
    template,
    amount: testAmount,
    date: new Date(),
    description: `Test: ${template.name}`,
  });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-900">Test šablóny</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Testovacia suma</label>
            <input
              type="number"
              value={testAmount}
              onChange={(e) => onAmountChange(parseFloat(e.target.value) || 0)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
            />
          </div>

          <div className="bg-slate-50 rounded-xl p-4">
            <div className="text-sm font-medium text-slate-700 mb-3">Náhľad transakcie:</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-500">
                  <th className="text-left py-1">Účet</th>
                  <th className="text-right py-1">MD</th>
                  <th className="text-right py-1">D</th>
                </tr>
              </thead>
              <tbody>
                {draft.lines.map((line, i) => {
                  const account = accounts.find((a) => a.code === line.accountCode);
                  return (
                    <tr key={i} className="border-t border-slate-200">
                      <td className="py-2">
                        <span className="font-mono">{line.accountCode}</span>
                        <span className="text-slate-500 ml-2">{account?.name}</span>
                      </td>
                      <td className="py-2 text-right font-mono">
                        {line.side === "MD" ? formatEUR(line.amount) : ""}
                      </td>
                      <td className="py-2 text-right font-mono">
                        {line.side === "D" ? formatEUR(line.amount) : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-slate-300">
                <tr className="font-semibold">
                  <td className="py-2">Súčet</td>
                  <td className="py-2 text-right font-mono">{formatEUR(draft.totalMd)}</td>
                  <td className="py-2 text-right font-mono">{formatEUR(draft.totalD)}</td>
                </tr>
              </tfoot>
            </table>

            <div className={`mt-3 p-2 rounded-lg text-sm font-medium ${
              draft.isBalanced
                ? "bg-emerald-100 text-emerald-700"
                : "bg-rose-100 text-rose-700"
            }`}>
              {draft.isBalanced ? "✓ Transakcia je vyvážená" : "⚠️ Transakcia NIE JE vyvážená!"}
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-full px-4 py-3 rounded-xl bg-slate-900 text-white font-medium hover:bg-slate-800"
          >
            Zavrieť
          </button>
        </div>
      </div>
    </div>
  );
}
