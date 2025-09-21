// src/pages/Login.tsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { signInWithGoogle } from "@/firebase";
import { useUser } from "@/components/AuthGate";

export default function LoginPage() {
  const user = useUser();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [user, navigate]);

  const handleGoogle = async () => {
    try {
      await signInWithGoogle();
      // onAuthStateChanged ťa potom presmeruje v efekte vyššie
    } catch (e) {
      console.error(e);
      alert("Prihlásenie zlyhalo. Skús to znova.");
    }
  };

  return (
    <div style={pageWrap}>
      <div style={card}>
        {/* “Logo”/monogram */}
        <div style={logoCircle} aria-hidden>
          G
        </div>

        {/* Názov a podtitul */}
        <h1 style={title}>GPCS účtovníctvo</h1>
        <p style={subtitle}>
          Prihlás sa cez Google a tvoje dáta sa budú bezpečne ukladať do Firestore.
        </p>

        {/* Tlačidlo Google */}
        <button onClick={handleGoogle} style={googleBtn} onMouseDown={(e) => e.currentTarget.blur()}>
          <span style={googleIconWrap}>{googleIcon}</span>
          <span>Prihlásiť sa cez Google</span>
        </button>

        {/* Divider */}
        <div style={dividerWrap}>
          <span style={dividerLine} />
          <span style={dividerText}>alebo</span>
          <span style={dividerLine} />
        </div>

        {/* Malý hint */}
        <div style={hint}>
          Prihlásenie je len na identifikáciu používateľa. Nezdieľame žiadne údaje tretím stranám.
        </div>
      </div>

      {/* Footer */}
      <div style={footer}>
        © {new Date().getFullYear()} GPCS s.r.o. – Global Printing and Control Solutions
      </div>
    </div>
  );
}

/* ===== Styles ===== */

const pageWrap: React.CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  background:
    "linear-gradient(135deg, rgba(16,185,129,0.12), rgba(59,130,246,0.12)), radial-gradient(1200px 600px at 0% 0%, rgba(37,99,235,0.10), transparent 60%)",
  padding: 16,
};

const card: React.CSSProperties = {
  width: "100%",
  maxWidth: 420,
  background: "#fff",
  borderRadius: 16,
  border: "1px solid #e5e7eb",
  boxShadow:
    "0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -2px rgba(0,0,0,0.05)",
  padding: 24,
  textAlign: "center",
};

const logoCircle: React.CSSProperties = {
  width: 52,
  height: 52,
  borderRadius: 12,
  background: "#111827",
  color: "#fff",
  display: "grid",
  placeItems: "center",
  fontWeight: 800,
  fontSize: 20,
  margin: "0 auto 12px",
  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)",
};

const title: React.CSSProperties = {
  margin: "6px 0 4px",
  fontSize: 22,
  fontWeight: 800,
  color: "#111827",
  letterSpacing: 0.2,
};

const subtitle: React.CSSProperties = {
  margin: "0 0 18px",
  fontSize: 14,
  color: "#475569",
  lineHeight: 1.5,
};

const googleBtn: React.CSSProperties = {
  width: "100%",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #d1d5db",
  background: "#fff",
  cursor: "pointer",
  fontSize: 15,
  fontWeight: 600,
  color: "#111827",
  transition: "box-shadow .15s ease, transform .02s ease, border-color .15s ease",
  outline: "none",
} as React.CSSProperties;

// Hover/focus efekty cez inline JS
(Object.assign(googleBtn, {
  onmouseenter: undefined,
  onfocus: undefined,
}) as any);

const googleIconWrap: React.CSSProperties = {
  width: 18,
  height: 18,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const dividerWrap: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto 1fr",
  alignItems: "center",
  gap: 10,
  margin: "18px 0 10px",
};

const dividerLine: React.CSSProperties = {
  height: 1,
  background: "#e5e7eb",
};

const dividerText: React.CSSProperties = {
  fontSize: 12,
  color: "#9ca3af",
  textTransform: "uppercase",
  letterSpacing: 1,
};

const hint: React.CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
  lineHeight: 1.5,
};

const footer: React.CSSProperties = {
  marginTop: 16,
  textAlign: "center",
  fontSize: 12,
  color: "#6b7280",
};

/* ===== SVG ===== */

const googleIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden focusable="false">
    <path
      fill="#EA4335"
      d="M12 10.2v3.6h5.1c-.2 1.2-1.5 3.6-5.1 3.6-3.1 0-5.6-2.5-5.6-5.6S8.9 6.2 12 6.2c1.8 0 3 .8 3.7 1.5l2.5-2.5C16.9 3.8 14.7 2.8 12 2.8 7.5 2.8 3.8 6.5 3.8 11s3.7 8.2 8.2 8.2c4.7 0 7.8-3.3 7.8-8 0-.5 0-.9-.1-1.2H12z"
    />
  </svg>
);

