// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import { AuthGate, useUser } from "./components/AuthGate";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Entries from "./pages/Entries";
import Partners from "./pages/Partners";
import Settings from "./pages/Settings";
import InvoiceForm from "./pages/InvoiceForm";
import InvoicePreview from "./pages/InvoicePreview";
import Login from "./pages/Login";

// Accounting pages
import ChartOfAccounts from "./pages/accounting/ChartOfAccounts";
import Transactions from "./pages/accounting/Transactions";
import Guides from "./pages/accounting/Guides";
import Journal from "./pages/accounting/Journal";
import GeneralLedger from "./pages/accounting/GeneralLedger";
import Saldokonto from "./pages/accounting/Saldokonto";
import Tasks from "./pages/accounting/Tasks";
import Templates from "./pages/accounting/Templates";
import Bank from "./pages/accounting/Bank";
import Payroll from "./pages/accounting/Payroll";
import PeriodClosing from "./pages/accounting/PeriodClosing";
import Notifications from "./pages/accounting/Notifications";

import "./index.css";

function Protected({ children }: { children: React.ReactNode }) {
  const user = useUser();
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthGate>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route path="/" element={<Protected><Dashboard /></Protected>} />
          <Route path="/prijmy" element={<Protected><Entries type="INCOME" /></Protected>} />
          <Route path="/vydavky" element={<Protected><Entries type="EXPENSE" /></Protected>} />
          <Route path="/partneri" element={<Protected><Partners /></Protected>} />
          <Route path="/nastavenia" element={<Protected><Settings /></Protected>} />
          <Route path="/invoices/new" element={<Protected><InvoiceForm /></Protected>} />
          <Route path="/invoices/preview/:id" element={<Protected><InvoicePreview /></Protected>} />
          <Route path="/faktury-prijate" element={<Protected><Entries type="EXPENSE" /></Protected>} />
          <Route path="/doklady" element={<Protected><Entries type="EXPENSE" /></Protected>} />

          {/* Accounting routes */}
          <Route path="/uctovnictvo/transakcie" element={<Protected><Transactions /></Protected>} />
          <Route path="/uctovnictvo/rozvrh" element={<Protected><ChartOfAccounts /></Protected>} />
          <Route path="/uctovnictvo/navody" element={<Protected><Guides /></Protected>} />
          <Route path="/uctovnictvo/dennik" element={<Protected><Journal /></Protected>} />
          <Route path="/uctovnictvo/hlavna-kniha" element={<Protected><GeneralLedger /></Protected>} />
          <Route path="/uctovnictvo/saldokonto" element={<Protected><Saldokonto /></Protected>} />
          <Route path="/uctovnictvo/banka" element={<Protected><Bank /></Protected>} />
          <Route path="/uctovnictvo/sablony" element={<Protected><Templates /></Protected>} />
          <Route path="/uctovnictvo/mzdy" element={<Protected><Payroll /></Protected>} />
          <Route path="/uctovnictvo/uzavierky" element={<Protected><PeriodClosing /></Protected>} />
          <Route path="/uctovnictvo/ulohy" element={<Protected><Tasks /></Protected>} />
          <Route path="/uctovnictvo/notifikacie" element={<Protected><Notifications /></Protected>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthGate>
  </React.StrictMode>
);


