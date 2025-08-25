import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import App from "./App";
import { AuthGate } from "./components/AuthGate";
import InvoiceForm from "./pages/InvoiceForm";
import InvoicePreview from "./pages/InvoicePreview"; // 👈 nový route
import Login from "./pages/Login";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<AuthGate><App /></AuthGate>} />
        <Route path="/invoices/new" element={<AuthGate><InvoiceForm /></AuthGate>} />
        <Route path="/invoices/preview/:id" element={<AuthGate><InvoicePreview /></AuthGate>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);


