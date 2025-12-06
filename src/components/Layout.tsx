// src/components/Layout.tsx
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useUser } from "./AuthGate";
import { signOutFirebase } from "@/firebase";
import {
  LayoutDashboard,
  FileText,
  TrendingUp,
  TrendingDown,
  Building2,
  Calculator,
  Menu,
  X,
  LogOut,
  User,
  ChevronRight,
} from "lucide-react";

const COMPANY_SHORT = "GPCS s.r.o.";

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { label: "Dashboard", path: "/", icon: <LayoutDashboard size={20} /> },
  { label: "Nová faktúra", path: "/invoices/new", icon: <FileText size={20} /> },
  { label: "Príjmy", path: "/prijmy", icon: <TrendingUp size={20} /> },
  { label: "Výdavky", path: "/vydavky", icon: <TrendingDown size={20} /> },
  { label: "Firmy", path: "/firmy", icon: <Building2 size={20} /> },
  { label: "Daňová kalkulačka", path: "/dane", icon: <Calculator size={20} /> },
];

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
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={`
                    flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200
                    ${
                      isActive
                        ? "bg-slate-900 text-white shadow-lg shadow-slate-900/20"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }
                  `}
                >
                  {item.icon}
                  <span className="font-medium">{item.label}</span>
                  {isActive && <ChevronRight size={16} className="ml-auto" />}
                </Link>
              );
            })}
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
