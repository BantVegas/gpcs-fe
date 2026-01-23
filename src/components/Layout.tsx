// src/components/Layout.tsx
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useUser } from "./AuthGate";
import { signOutFirebase } from "@/firebase";
import {
  LayoutDashboard,
  FileText,
  Settings,
  Menu,
  X,
  LogOut,
  User,
  ChevronRight,
  ChevronDown,
  FileInput,
  Users,
  BookOpen,
  Landmark,
  FileSpreadsheet,
  ClipboardList,
  Lock,
  HelpCircle,
  CalendarCheck,
  Bell,
  Wallet,
  Receipt,
  ListTree,
} from "lucide-react";

const COMPANY_SHORT = "GPCS s.r.o.";

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

interface NavSection {
  title: string;
  icon: React.ReactNode;
  items: NavItem[];
  collapsible?: boolean;
}

const navSections: NavSection[] = [
  {
    title: "Operatíva",
    icon: <LayoutDashboard size={18} />,
    items: [
      { label: "Dashboard", path: "/", icon: <LayoutDashboard size={20} /> },
      { label: "Doklady (Inbox)", path: "/doklady", icon: <FileInput size={20} /> },
      { label: "Faktúry (vystavené)", path: "/invoices/new", icon: <FileText size={20} /> },
      { label: "Partneri", path: "/partneri", icon: <Users size={20} /> },
      { label: "Nastavenia", path: "/nastavenia", icon: <Settings size={20} /> },
    ],
  },
  {
    title: "Vedenie účtovníctva",
    icon: <BookOpen size={18} />,
    collapsible: true,
    items: [
      { label: "Účtovanie", path: "/uctovnictvo/transakcie", icon: <Receipt size={20} /> },
      { label: "Účtovný denník", path: "/uctovnictvo/dennik", icon: <FileSpreadsheet size={20} /> },
      { label: "Hlavná kniha", path: "/uctovnictvo/hlavna-kniha", icon: <BookOpen size={20} /> },
      { label: "Saldokonto", path: "/uctovnictvo/saldokonto", icon: <ClipboardList size={20} /> },
      { label: "Banka (221)", path: "/uctovnictvo/banka", icon: <Landmark size={20} /> },
      { label: "Účtový rozvrh", path: "/uctovnictvo/rozvrh", icon: <ListTree size={20} /> },
      { label: "Šablóny účtovania", path: "/uctovnictvo/sablony", icon: <FileText size={20} /> },
      { label: "Mzdy", path: "/uctovnictvo/mzdy", icon: <Wallet size={20} /> },
      { label: "Uzávierky", path: "/uctovnictvo/uzavierky", icon: <Lock size={20} /> },
      { label: "Návody", path: "/uctovnictvo/navody", icon: <HelpCircle size={20} /> },
      { label: "Povinnosti & Termíny", path: "/uctovnictvo/ulohy", icon: <CalendarCheck size={20} /> },
      { label: "Notifikácie", path: "/uctovnictvo/notifikacie", icon: <Bell size={20} /> },
    ],
  },
];

function NavSectionComponent({
  section,
  currentPath,
  onNavigate,
}: {
  section: NavSection;
  currentPath: string;
  onNavigate: () => void;
}) {
  const [isOpen, setIsOpen] = useState(!section.collapsible);
  const hasActiveItem = section.items.some((item) => currentPath === item.path || currentPath.startsWith(item.path + "/"));

  return (
    <div>
      {section.collapsible ? (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider rounded-lg transition-colors ${
            hasActiveItem ? "text-slate-900 bg-slate-100" : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
          }`}
        >
          {section.icon}
          <span className="flex-1 text-left">{section.title}</span>
          <ChevronDown size={14} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </button>
      ) : (
        <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-2">
          {section.icon}
          {section.title}
        </div>
      )}
      {(isOpen || !section.collapsible) && (
        <div className="mt-1 space-y-1">
          {section.items.map((item) => {
            const isActive = currentPath === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={onNavigate}
                className={`
                  flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200
                  ${
                    isActive
                      ? "bg-slate-900 text-white shadow-lg shadow-slate-900/20"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }
                `}
              >
                {item.icon}
                <span className="font-medium text-sm">{item.label}</span>
                {isActive && <ChevronRight size={14} className="ml-auto" />}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const user = useUser();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Mobile header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-lg border-b border-slate-200">
        <div className="flex items-center justify-between px-4 h-14">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <Menu size={24} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-800 to-slate-900 text-white grid place-items-center font-bold text-sm">
              G
            </div>
            <span className="font-bold text-slate-900">{COMPANY_SHORT}</span>
          </div>
          <div className="w-10" />
        </div>
      </header>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-50"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 z-50 h-full w-72 bg-white border-r border-slate-200 
          transform transition-transform duration-300 ease-in-out
          lg:translate-x-0
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between p-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 text-white grid place-items-center font-bold">
                G
              </div>
              <div>
                <div className="font-bold text-slate-900">{COMPANY_SHORT}</div>
                <div className="text-xs text-slate-500">Účtovníctvo</div>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-2 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-4 overflow-y-auto">
            {navSections.map((section) => (
              <NavSectionComponent
                key={section.title}
                section={section}
                currentPath={location.pathname}
                onNavigate={() => setSidebarOpen(false)}
              />
            ))}
          </nav>

          {/* User section */}
          <div className="p-4 border-t border-slate-100">
            {user ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-50">
                  <div className="w-8 h-8 rounded-full bg-slate-200 grid place-items-center">
                    <User size={16} className="text-slate-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">
                      {user.email}
                    </div>
                    <div className="text-xs text-slate-500">Prihlásený</div>
                  </div>
                </div>
                <button
                  onClick={() => signOutFirebase()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                >
                  <LogOut size={18} />
                  <span className="font-medium">Odhlásiť sa</span>
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="block w-full text-center px-4 py-2.5 rounded-xl bg-slate-900 text-white font-medium hover:bg-slate-800 transition-colors"
              >
                Prihlásiť sa
              </Link>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:ml-72 min-h-screen pt-14 lg:pt-0">
        <div className="p-4 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
