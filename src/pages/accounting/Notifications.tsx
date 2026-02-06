// src/pages/accounting/Notifications.tsx
import { useState, useEffect } from "react";
import { Bell, BellOff, Check, Trash2, Settings, Clock, Calendar, Smartphone } from "lucide-react";
import { db, requestNotificationPermission, saveFCMToken, onForegroundMessage } from "@/firebase";
import { collection, doc, getDocs, getDoc, setDoc, updateDoc, deleteDoc, Timestamp } from "firebase/firestore";
import { useUser } from "@/components/AuthGate";
import type { Notification, NotificationSettings, Task } from "@/lib/accountingSchemas";
import { DEFAULT_NOTIFICATION_SETTINGS } from "@/lib/accountingSchemas";

function getCompanyId(): string {
  const stored = localStorage.getItem("gpcs-company-id");
  return stored || "gpcs";
}

function formatDateTime(ts: Timestamp): string {
  return ts.toDate().toLocaleString("sk-SK", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelativeTime(ts: Timestamp): string {
  const now = new Date();
  const date = ts.toDate();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Práve teraz";
  if (diffMins < 60) return `Pred ${diffMins} min`;
  if (diffHours < 24) return `Pred ${diffHours} hod`;
  if (diffDays < 7) return `Pred ${diffDays} dňami`;
  return formatDateTime(ts);
}

export default function Notifications() {
  const user = useUser();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>("default");
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [registeringMobile, setRegisteringMobile] = useState(false);

  useEffect(() => {
    loadData();
    checkPushSupport();
    
    // Listen for foreground messages
    const unsubscribe = onForegroundMessage((payload) => {
      console.log("Foreground message received:", payload);
      // Show in-app notification
      if (payload.notification) {
        // Create a notification in Firestore
        createNotificationFromPush(payload.notification.title || "", payload.notification.body || "");
      }
    });
    
    return () => unsubscribe();
  }, []);

  async function loadData() {
    setLoading(true);
    const companyId = getCompanyId();

    // Load notification settings
    const settingsRef = doc(db, "companies", companyId, "settings", "notifications");
    const settingsSnap = await getDoc(settingsRef);
    if (settingsSnap.exists()) {
      setSettings(settingsSnap.data() as NotificationSettings);
    } else {
      await setDoc(settingsRef, DEFAULT_NOTIFICATION_SETTINGS);
    }

    // Load notifications history
    const notificationsRef = collection(db, "companies", companyId, "notifications");
    const notificationsSnap = await getDocs(notificationsRef);
    const loadedNotifications = notificationsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Notification));
    loadedNotifications.sort((a, b) => {
      const dateA = a.createdAt instanceof Timestamp ? a.createdAt.toDate() : new Date();
      const dateB = b.createdAt instanceof Timestamp ? b.createdAt.toDate() : new Date();
      return dateB.getTime() - dateA.getTime();
    });
    setNotifications(loadedNotifications);

    // Load tasks with reminders
    const tasksRef = collection(db, "companies", companyId, "tasks");
    const tasksSnap = await getDocs(tasksRef);
    const loadedTasks = tasksSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Task));
    setTasks(loadedTasks.filter((t) => t.status !== "COMPLETED"));

    setLoading(false);
  }

  function checkPushSupport() {
    if ("Notification" in window) {
      setPushSupported(true);
      setPushPermission(Notification.permission);
    }
  }

  async function createNotificationFromPush(title: string, body: string) {
    const companyId = getCompanyId();
    const notificationsRef = collection(db, "companies", companyId, "notifications");
    const newRef = doc(notificationsRef);
    await setDoc(newRef, {
      id: newRef.id,
      type: "PUSH",
      title,
      message: body,
      read: false,
      createdAt: Timestamp.now(),
    });
    await loadData();
  }

  async function requestPushPermission() {
    if (!pushSupported) return;

    const permission = await Notification.requestPermission();
    setPushPermission(permission);

    if (permission === "granted") {
      // Show test notification
      new Notification("GPCS Účto", {
        body: "Notifikácie boli úspešne povolené!",
        icon: "/icons/icon-192x192.png",
      });
    }
  }
  
  async function registerForMobileNotifications() {
    if (!user) return;
    
    setRegisteringMobile(true);
    try {
      const token = await requestNotificationPermission();
      if (token) {
        const companyId = getCompanyId();
        await saveFCMToken(user.uid, token, companyId);
        setFcmToken(token);
        setPushPermission("granted");
        
        // Show success notification
        new Notification("GPCS Účto", {
          body: "Mobilné notifikácie boli úspešne aktivované! Budete dostávať upozornenia aj keď je aplikácia zatvorená.",
          icon: "/icons/icon-192x192.png",
        });
      }
    } catch (error) {
      console.error("Failed to register for mobile notifications:", error);
      alert("Nepodarilo sa aktivovať mobilné notifikácie. Skúste to znova.");
    } finally {
      setRegisteringMobile(false);
    }
  }

  async function saveSettings(newSettings: NotificationSettings) {
    const companyId = getCompanyId();
    const settingsRef = doc(db, "companies", companyId, "settings", "notifications");
    await setDoc(settingsRef, newSettings);
    setSettings(newSettings);
    setShowSettings(false);
  }

  async function markAsRead(notificationId: string) {
    const companyId = getCompanyId();
    const ref = doc(db, "companies", companyId, "notifications", notificationId);
    await updateDoc(ref, {
      read: true,
      readAt: Timestamp.now(),
    });
    await loadData();
  }

  async function markAllAsRead() {
    const companyId = getCompanyId();
    const unread = notifications.filter((n) => !n.read);
    for (const n of unread) {
      const ref = doc(db, "companies", companyId, "notifications", n.id);
      await updateDoc(ref, {
        read: true,
        readAt: Timestamp.now(),
      });
    }
    await loadData();
  }

  async function deleteNotification(notificationId: string) {
    const companyId = getCompanyId();
    const ref = doc(db, "companies", companyId, "notifications", notificationId);
    await deleteDoc(ref);
    await loadData();
  }

  async function createTestNotification() {
    const companyId = getCompanyId();
    const notificationsRef = collection(db, "companies", companyId, "notifications");
    const newRef = doc(notificationsRef);
    await setDoc(newRef, {
      id: newRef.id,
      type: "SYSTEM",
      title: "Testovacia notifikácia",
      message: "Toto je testovacia notifikácia pre overenie funkčnosti systému.",
      read: false,
      createdAt: Timestamp.now(),
    });

    // Also show browser notification if permitted
    if (pushPermission === "granted" && settings.pushNotifications) {
      new Notification("GPCS Účto - Test", {
        body: "Toto je testovacia notifikácia",
        icon: "/icons/icon-192x192.png",
      });
    }

    await loadData();
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "TASK_DUE":
        return <Clock size={20} className="text-amber-500" />;
      case "TASK_OVERDUE":
        return <Bell size={20} className="text-rose-500" />;
      case "PERIOD_CLOSING":
        return <Calendar size={20} className="text-blue-500" />;
      default:
        return <Bell size={20} className="text-slate-500" />;
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
          <h1 className="text-2xl font-bold text-slate-900">Notifikácie</h1>
          <p className="text-slate-500">Pripomienky a upozornenia</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors"
          >
            <Settings size={20} />
            Nastavenia
          </button>
          <button
            onClick={createTestNotification}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-colors"
          >
            <Bell size={20} />
            Test
          </button>
        </div>
      </div>

      {/* Mobile push notifications - main feature */}
      <div className={`rounded-2xl p-5 ${
        fcmToken 
          ? "bg-emerald-50 border border-emerald-200" 
          : "bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200"
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              fcmToken ? "bg-emerald-100" : "bg-blue-100"
            }`}>
              <Smartphone size={24} className={fcmToken ? "text-emerald-600" : "text-blue-600"} />
            </div>
            <div>
              <div className="font-semibold text-lg">
                {fcmToken 
                  ? "📱 Mobilné notifikácie sú aktívne!" 
                  : "📱 Aktivujte mobilné notifikácie"}
              </div>
              <div className="text-sm text-slate-600">
                {fcmToken 
                  ? "Budete dostávať upozornenia na mobil aj keď je aplikácia zatvorená" 
                  : "Dostávajte upozornenia na faktúry, termíny a úlohy priamo na mobil"}
              </div>
            </div>
          </div>
          {!fcmToken && (
            <button
              onClick={registerForMobileNotifications}
              disabled={registeringMobile}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-sm font-medium disabled:opacity-50 flex items-center gap-2"
            >
              {registeringMobile ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  Aktivujem...
                </>
              ) : (
                <>
                  <Bell size={18} />
                  Aktivovať
                </>
              )}
            </button>
          )}
        </div>
        
        {/* What notifications you'll receive */}
        {!fcmToken && (
          <div className="mt-4 pt-4 border-t border-blue-200">
            <div className="text-sm font-medium text-slate-700 mb-2">Budete dostávať upozornenia na:</div>
            <div className="grid grid-cols-2 gap-2 text-sm text-slate-600">
              <div className="flex items-center gap-2">
                <span className="text-amber-500">⏰</span> Úlohy s blížiacim sa termínom
              </div>
              <div className="flex items-center gap-2">
                <span className="text-rose-500">💰</span> Faktúry po splatnosti
              </div>
              <div className="flex items-center gap-2">
                <span className="text-blue-500">📄</span> Nové dokumenty v Inboxe
              </div>
              <div className="flex items-center gap-2">
                <span className="text-emerald-500">✅</span> Dokončené spracovanie
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Push notification status */}
      {pushSupported && (
        <div className={`rounded-2xl p-4 ${
          pushPermission === "granted" 
            ? "bg-emerald-50 border border-emerald-100" 
            : pushPermission === "denied"
            ? "bg-rose-50 border border-rose-100"
            : "bg-amber-50 border border-amber-100"
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {pushPermission === "granted" ? (
                <Bell size={24} className="text-emerald-600" />
              ) : (
                <BellOff size={24} className={pushPermission === "denied" ? "text-rose-600" : "text-amber-600"} />
              )}
              <div>
                <div className="font-medium">
                  {pushPermission === "granted" 
                    ? "Push notifikácie sú povolené" 
                    : pushPermission === "denied"
                    ? "Push notifikácie sú zablokované"
                    : "Push notifikácie nie sú povolené"}
                </div>
                <div className="text-sm text-slate-600">
                  {pushPermission === "granted" 
                    ? "Budete dostávať pripomienky priamo do prehliadača" 
                    : pushPermission === "denied"
                    ? "Povoľte notifikácie v nastaveniach prehliadača"
                    : "Povoľte notifikácie pre lepšiu skúsenosť"}
                </div>
              </div>
            </div>
            {pushPermission === "default" && (
              <button
                onClick={requestPushPermission}
                className="px-4 py-2 bg-amber-600 text-white rounded-xl hover:bg-amber-700 text-sm font-medium"
              >
                Povoliť
              </button>
            )}
          </div>
        </div>
      )}

      {/* Upcoming tasks */}
      {tasks.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <h3 className="font-semibold text-slate-900 mb-3">Nadchádzajúce úlohy ({tasks.length})</h3>
          <div className="space-y-2">
            {tasks.slice(0, 5).map((task) => {
              const dueDate = task.dueDate instanceof Timestamp ? task.dueDate.toDate() : new Date();
              const isOverdue = dueDate < new Date();
              return (
                <div
                  key={task.id}
                  className={`p-3 rounded-xl flex items-center justify-between ${
                    isOverdue ? "bg-rose-50" : "bg-slate-50"
                  }`}
                >
                  <div>
                    <div className={`font-medium ${isOverdue ? "text-rose-700" : "text-slate-900"}`}>
                      {task.title}
                    </div>
                    <div className={`text-sm ${isOverdue ? "text-rose-600" : "text-slate-500"}`}>
                      {isOverdue ? "Po termíne: " : "Termín: "}
                      {dueDate.toLocaleDateString("sk-SK")}
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    task.severity === "CRITICAL" ? "bg-rose-100 text-rose-700" :
                    task.severity === "HIGH" ? "bg-amber-100 text-amber-700" :
                    "bg-slate-100 text-slate-600"
                  }`}>
                    {task.severity}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Notifications list */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-900">História notifikácií</h3>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded-full text-xs font-medium">
                {unreadCount} neprečítaných
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="text-sm text-slate-600 hover:text-slate-900"
            >
              Označiť všetky ako prečítané
            </button>
          )}
        </div>
        <div className="divide-y divide-slate-100">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className={`px-6 py-4 flex items-start gap-4 ${
                notification.read ? "bg-white" : "bg-blue-50"
              }`}
            >
              <div className="flex-shrink-0 mt-1">
                {getNotificationIcon(notification.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className={`font-medium ${notification.read ? "text-slate-700" : "text-slate-900"}`}>
                      {notification.title}
                    </div>
                    <div className="text-sm text-slate-600 mt-0.5">{notification.message}</div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!notification.read && (
                      <button
                        onClick={() => markAsRead(notification.id)}
                        className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg"
                        title="Označiť ako prečítané"
                      >
                        <Check size={16} />
                      </button>
                    )}
                    <button
                      onClick={() => deleteNotification(notification.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                      title="Zmazať"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {formatRelativeTime(notification.createdAt)}
                </div>
              </div>
            </div>
          ))}
          {notifications.length === 0 && (
            <div className="px-6 py-12 text-center text-slate-500">
              Žiadne notifikácie
            </div>
          )}
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <NotificationSettingsModal
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSave={saveSettings}
        />
      )}
    </div>
  );
}

// ============================================================================
// NOTIFICATION SETTINGS MODAL
// ============================================================================

function NotificationSettingsModal({
  settings,
  onClose,
  onSave,
}: {
  settings: NotificationSettings;
  onClose: () => void;
  onSave: (settings: NotificationSettings) => void;
}) {
  const [formData, setFormData] = useState<NotificationSettings>(settings);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(formData);
    setSaving(false);
  };

  const dayNames = ["Nedeľa", "Pondelok", "Utorok", "Streda", "Štvrtok", "Piatok", "Sobota"];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-slate-900 mb-6">Nastavenia notifikácií</h2>

        <div className="space-y-4">
          {/* Enable/disable */}
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
            <div>
              <div className="font-medium text-slate-900">Notifikácie</div>
              <div className="text-sm text-slate-500">Povoliť všetky notifikácie</div>
            </div>
            <button
              onClick={() => setFormData({ ...formData, enabled: !formData.enabled })}
              className={`w-12 h-6 rounded-full transition-colors ${
                formData.enabled ? "bg-emerald-500" : "bg-slate-300"
              }`}
            >
              <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                formData.enabled ? "translate-x-6" : "translate-x-0.5"
              }`} />
            </button>
          </div>

          {/* Push notifications */}
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
            <div>
              <div className="font-medium text-slate-900">Push notifikácie</div>
              <div className="text-sm text-slate-500">Notifikácie v prehliadači</div>
            </div>
            <button
              onClick={() => setFormData({ ...formData, pushNotifications: !formData.pushNotifications })}
              className={`w-12 h-6 rounded-full transition-colors ${
                formData.pushNotifications ? "bg-emerald-500" : "bg-slate-300"
              }`}
            >
              <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                formData.pushNotifications ? "translate-x-6" : "translate-x-0.5"
              }`} />
            </button>
          </div>

          {/* Daily reminder time */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Čas dennej pripomienky
            </label>
            <input
              type="time"
              value={formData.dailyReminderTime}
              onChange={(e) => setFormData({ ...formData, dailyReminderTime: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
            />
          </div>

          {/* Weekly reminder day */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Deň týždennej pripomienky
            </label>
            <select
              value={formData.weeklyReminderDay}
              onChange={(e) => setFormData({ ...formData, weeklyReminderDay: parseInt(e.target.value) })}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
            >
              {dayNames.map((name, index) => (
                <option key={index} value={index}>{name}</option>
              ))}
            </select>
          </div>

          {/* Quiet hours */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Tichý režim od
              </label>
              <input
                type="time"
                value={formData.quietHoursStart}
                onChange={(e) => setFormData({ ...formData, quietHoursStart: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Tichý režim do
              </label>
              <input
                type="time"
                value={formData.quietHoursEnd}
                onChange={(e) => setFormData({ ...formData, quietHoursEnd: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-slate-900 focus:ring-1 focus:ring-slate-900 outline-none"
              />
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
