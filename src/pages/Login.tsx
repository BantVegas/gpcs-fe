// src/pages/Login.tsx
import { signInWithGoogle } from "@/firebase";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const nav = useNavigate();
  const go = async () => {
    await signInWithGoogle();
    nav("/");
  };
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f8fafc" }}>
      <div style={{ background: "#fff", padding: 24, borderRadius: 12, border: "1px solid #e5e7eb" }}>
        <h1 style={{ marginTop: 0 }}>Prihlásenie</h1>
        <p>Prihlás sa cez Google, aby si mohol vytvárať a ukladať faktúry.</p>
        <button onClick={go} style={{ padding: "10px 14px", borderRadius: 10, background: "#111827", color: "#fff" }}>
          Prihlásiť sa cez Google
        </button>
      </div>
    </div>
  );
}

