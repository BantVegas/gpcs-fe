// src/pages/accounting/Tasks.tsx
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { CheckCircle, Circle, Clock, AlertTriangle, Calendar, ChevronRight } from "lucide-react";
import { db } from "@/firebase";
import { collection, doc, getDocs, setDoc, updateDoc, Timestamp } from "firebase/firestore";
import { useUser } from "@/components/AuthGate";
import { DEFAULT_TASKS, type Task, type TaskCategory } from "@/lib/accountingSchemas";

function getCompanyId(): string {
  const stored = localStorage.getItem("gpcs-company-id");
  return stored || "gpcs";
}

export default function Tasks() {
  const user = useUser();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [filterCategory, setFilterCategory] = useState<TaskCategory | "all">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "completed">("pending");

  useEffect(() => {
    loadTasks();
  }, []);

  async function loadTasks() {
    const companyId = getCompanyId();
    const tasksRef = collection(db, "companies", companyId, "tasks");
    const snap = await getDocs(tasksRef);
    
    if (snap.empty) {
      // Initialize with default tasks
      await initializeDefaultTasks();
      return;
    }
    
    const loaded = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Task));
    loaded.sort((a, b) => {
      const dateA = a.dueDate instanceof Timestamp ? a.dueDate.toDate() : new Date();
      const dateB = b.dueDate instanceof Timestamp ? b.dueDate.toDate() : new Date();
      return dateA.getTime() - dateB.getTime();
    });
    setTasks(loaded);
    setLoading(false);
  }

  async function initializeDefaultTasks() {
    const companyId = getCompanyId();
    const tasksRef = collection(db, "companies", companyId, "tasks");
    const now = Timestamp.now();
    
    for (let i = 0; i < DEFAULT_TASKS.length; i++) {
      const task = DEFAULT_TASKS[i];
      const newRef = doc(tasksRef);
      
      // Calculate next due date based on repeat rule
      let dueDate = new Date();
      if (task.category === "WEEKLY") {
        dueDate.setDate(dueDate.getDate() + (7 - dueDate.getDay() + 1) % 7); // Next Monday
      } else if (task.category === "MONTHLY") {
        dueDate.setDate(15); // 15th of current month
        if (dueDate < new Date()) {
          dueDate.setMonth(dueDate.getMonth() + 1);
        }
      } else if (task.category === "YEARLY") {
        dueDate = new Date(dueDate.getFullYear(), 2, 31); // March 31
        if (dueDate < new Date()) {
          dueDate.setFullYear(dueDate.getFullYear() + 1);
        }
      }
      
      await setDoc(newRef, {
        ...task,
        id: newRef.id,
        status: "PENDING",
        dueDate: Timestamp.fromDate(dueDate),
        createdAt: now,
        updatedAt: now,
      });
    }
    
    await loadTasks();
  }

  async function toggleChecklistItem(taskId: string, itemId: string) {
    const companyId = getCompanyId();
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    
    const updatedChecklist = task.checklist.map((item) => {
      if (item.id !== itemId) return item;
      return {
        ...item,
        completed: !item.completed,
        completedAt: !item.completed ? Timestamp.now() : undefined,
      };
    });
    
    // Check if all items are completed
    const allCompleted = updatedChecklist.every((item) => item.completed);
    
    const ref = doc(db, "companies", companyId, "tasks", taskId);
    await updateDoc(ref, {
      checklist: updatedChecklist,
      status: allCompleted ? "COMPLETED" : "IN_PROGRESS",
      completedAt: allCompleted ? Timestamp.now() : null,
      completedBy: allCompleted ? user?.uid : null,
      updatedAt: Timestamp.now(),
    });
    
    await loadTasks();
    
    // Update selected task if viewing
    if (selectedTask?.id === taskId) {
      setSelectedTask({
        ...selectedTask,
        checklist: updatedChecklist,
        status: allCompleted ? "COMPLETED" : "IN_PROGRESS",
      });
    }
  }

  async function resetTask(taskId: string) {
    const companyId = getCompanyId();
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    
    const resetChecklist = task.checklist.map((item) => ({
      ...item,
      completed: false,
      completedAt: undefined,
    }));
    
    // Calculate next due date
    let nextDue = new Date();
    if (task.category === "WEEKLY") {
      nextDue.setDate(nextDue.getDate() + 7);
    } else if (task.category === "MONTHLY") {
      nextDue.setMonth(nextDue.getMonth() + 1);
    } else if (task.category === "YEARLY") {
      nextDue.setFullYear(nextDue.getFullYear() + 1);
    }
    
    const ref = doc(db, "companies", companyId, "tasks", taskId);
    await updateDoc(ref, {
      checklist: resetChecklist,
      status: "PENDING",
      dueDate: Timestamp.fromDate(nextDue),
      completedAt: null,
      completedBy: null,
      updatedAt: Timestamp.now(),
    });
    
    await loadTasks();
    setSelectedTask(null);
  }

  const filteredTasks = tasks.filter((task) => {
    const matchesCategory = filterCategory === "all" || task.category === filterCategory;
    const matchesStatus = filterStatus === "all" || 
      (filterStatus === "pending" && task.status !== "COMPLETED") ||
      (filterStatus === "completed" && task.status === "COMPLETED");
    return matchesCategory && matchesStatus;
  });

  const getCategoryLabel = (category: TaskCategory) => {
    switch (category) {
      case "DAILY": return "Denná";
      case "WEEKLY": return "Týždenná";
      case "MONTHLY": return "Mesačná";
      case "YEARLY": return "Ročná";
      case "ONETIME": return "Jednorazová";
      default: return category;
    }
  };

  const getCategoryColor = (category: TaskCategory) => {
    switch (category) {
      case "DAILY": return "bg-blue-100 text-blue-700";
      case "WEEKLY": return "bg-purple-100 text-purple-700";
      case "MONTHLY": return "bg-amber-100 text-amber-700";
      case "YEARLY": return "bg-rose-100 text-rose-700";
      case "ONETIME": return "bg-slate-100 text-slate-700";
      default: return "bg-slate-100 text-slate-700";
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "CRITICAL": return <AlertTriangle size={16} className="text-rose-500" />;
      case "HIGH": return <AlertTriangle size={16} className="text-amber-500" />;
      default: return <Clock size={16} className="text-slate-400" />;
    }
  };

  const formatDueDate = (ts: Timestamp) => {
    const date = ts.toDate();
    const now = new Date();
    const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return { text: `${Math.abs(diffDays)} dní po termíne`, color: "text-rose-600" };
    if (diffDays === 0) return { text: "Dnes", color: "text-amber-600" };
    if (diffDays === 1) return { text: "Zajtra", color: "text-amber-600" };
    if (diffDays <= 7) return { text: `O ${diffDays} dní`, color: "text-slate-600" };
    return { text: date.toLocaleDateString("sk-SK"), color: "text-slate-500" };
  };

  const getProgress = (task: Task) => {
    const completed = task.checklist.filter((item) => item.completed).length;
    return { completed, total: task.checklist.length, percent: Math.round((completed / task.checklist.length) * 100) };
  };

  // Summary stats
  const pendingCount = tasks.filter((t) => t.status === "PENDING").length;
  const inProgressCount = tasks.filter((t) => t.status === "IN_PROGRESS").length;
  const overdueCount = tasks.filter((t) => {
    if (t.status === "COMPLETED") return false;
    const dueDate = t.dueDate instanceof Timestamp ? t.dueDate.toDate() : new Date();
    return dueDate < new Date();
  }).length;

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
        <h1 className="text-2xl font-bold text-slate-900">Povinnosti & Termíny</h1>
        <p className="text-slate-500">Prehľad účtovných úloh a termínov</p>
      </div>

      {selectedTask ? (
        <TaskDetail
          task={selectedTask}
          onBack={() => setSelectedTask(null)}
          onToggleItem={(itemId) => toggleChecklistItem(selectedTask.id, itemId)}
          onReset={() => resetTask(selectedTask.id)}
        />
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                  <Clock size={20} className="text-amber-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-slate-900">{pendingCount}</div>
                  <div className="text-sm text-slate-500">Čakajúce</div>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                  <Circle size={20} className="text-blue-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-slate-900">{inProgressCount}</div>
                  <div className="text-sm text-slate-500">Rozpracované</div>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
                  <AlertTriangle size={20} className="text-rose-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-slate-900">{overdueCount}</div>
                  <div className="text-sm text-slate-500">Po termíne</div>
                </div>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
            <div className="flex flex-wrap gap-4">
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value as TaskCategory | "all")}
                className="px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
              >
                <option value="all">Všetky kategórie</option>
                <option value="WEEKLY">Týždenné</option>
                <option value="MONTHLY">Mesačné</option>
                <option value="YEARLY">Ročné</option>
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as "all" | "pending" | "completed")}
                className="px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
              >
                <option value="pending">Aktívne</option>
                <option value="completed">Dokončené</option>
                <option value="all">Všetky</option>
              </select>
            </div>
          </div>

          {/* Tasks list */}
          <div className="space-y-3">
            {filteredTasks.map((task) => {
              const progress = getProgress(task);
              const dueInfo = formatDueDate(task.dueDate);
              const isOverdue = task.status !== "COMPLETED" && task.dueDate.toDate() < new Date();
              
              return (
                <div
                  key={task.id}
                  onClick={() => setSelectedTask(task)}
                  className={`bg-white rounded-2xl shadow-sm border p-5 cursor-pointer hover:shadow-md transition-shadow ${
                    isOverdue ? "border-rose-200" : "border-slate-100"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {getSeverityIcon(task.severity)}
                        <h3 className="font-semibold text-slate-900">{task.title}</h3>
                      </div>
                      <p className="text-sm text-slate-600 mb-3">{task.description}</p>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${getCategoryColor(task.category)}`}>
                          {getCategoryLabel(task.category)}
                        </span>
                        <span className={`text-sm ${dueInfo.color}`}>
                          <Calendar size={14} className="inline mr-1" />
                          {dueInfo.text}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-sm font-medium text-slate-700">
                          {progress.completed}/{progress.total}
                        </div>
                        <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden mt-1">
                          <div
                            className={`h-full transition-all ${
                              progress.percent === 100 ? "bg-emerald-500" : "bg-slate-400"
                            }`}
                            style={{ width: `${progress.percent}%` }}
                          />
                        </div>
                      </div>
                      <ChevronRight size={20} className="text-slate-400" />
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredTasks.length === 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-12 text-center">
                <CheckCircle size={48} className="mx-auto text-emerald-500 mb-3" />
                <h3 className="text-lg font-semibold text-slate-900 mb-1">Všetko hotové!</h3>
                <p className="text-slate-500">Žiadne aktívne úlohy v tejto kategórii.</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function TaskDetail({
  task,
  onBack,
  onToggleItem,
  onReset,
}: {
  task: Task;
  onBack: () => void;
  onToggleItem: (itemId: string) => void;
  onReset: () => void;
}) {
  const progress = task.checklist.filter((item) => item.completed).length;
  const isComplete = progress === task.checklist.length;

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

      {/* Task header */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{task.title}</h2>
            <p className="text-slate-600 mt-1">{task.description}</p>
          </div>
          {isComplete && (
            <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-sm font-medium">
              ✓ Dokončené
            </span>
          )}
        </div>

        {/* Progress */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${isComplete ? "bg-emerald-500" : "bg-slate-900"}`}
              style={{ width: `${(progress / task.checklist.length) * 100}%` }}
            />
          </div>
          <span className="text-sm font-medium text-slate-700">
            {progress}/{task.checklist.length} krokov
          </span>
        </div>

        {/* Checklist */}
        <div className="space-y-2">
          {task.checklist.map((item, index) => (
            <div
              key={item.id}
              onClick={() => onToggleItem(item.id)}
              className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
                item.completed ? "bg-emerald-50" : "bg-slate-50 hover:bg-slate-100"
              }`}
            >
              {item.completed ? (
                <CheckCircle size={20} className="text-emerald-600 flex-shrink-0" />
              ) : (
                <Circle size={20} className="text-slate-400 flex-shrink-0" />
              )}
              <span className={`flex-1 ${item.completed ? "text-emerald-700 line-through" : "text-slate-700"}`}>
                {index + 1}. {item.text}
              </span>
            </div>
          ))}
        </div>

        {/* Reset button */}
        {isComplete && (
          <button
            onClick={onReset}
            className="mt-4 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-colors"
          >
            Resetovať a naplánovať ďalší termín
          </button>
        )}
      </div>

      {/* Quick links */}
      {task.links.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h3 className="font-semibold text-slate-900 mb-3">Rýchle akcie</h3>
          <div className="flex flex-wrap gap-2">
            {task.links.map((link, i) => (
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
