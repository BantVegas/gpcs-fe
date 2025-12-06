// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import App from "./App";
import { AuthGate, useUser } from "./components/AuthGate";
import Layout from "./components/Layout";
import InvoiceForm from "./pages/InvoiceForm";
import InvoicePreview from "./pages/InvoicePreview";
import Login from "./pages/Login";
import CompaniesPage from "./pages/Companies";
import TaxCalculator from "./pages/TaxCalculator";
import "./index.css";

// Jednoduchý guard – ak nie je user, presmeruje na /login
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

          <Route path="/" element={<Protected><App /></Protected>} />
          <Route path="/invoices/new" element={<Protected><InvoiceForm /></Protected>} />
          <Route path="/invoices/preview/:id" element={<Protected><InvoicePreview /></Protected>} />
          <Route path="/prijmy" element={<Protected><App /></Protected>} />
          <Route path="/vydavky" element={<Protected><App /></Protected>} />
          <Route path="/firmy" element={<Protected><CompaniesPage /></Protected>} />
          <Route path="/dane" element={<Protected><TaxCalculator /></Protected>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthGate>
  </React.StrictMode>
);


