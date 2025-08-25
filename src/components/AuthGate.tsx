// src/components/AuthGate.tsx
import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import type { User } from "firebase/auth";
import { auth, onAuthStateChangedFirebase } from "@/firebase";

/**
 * Vracia:
 *  - undefined počas načítania
 *  - null ak nie je prihlásený
 *  - User keď je prihlásený
 */
export function useUser(): User | null | undefined {
  // predvyplní aktuálneho usera, ak už je k dispozícii (žiadny flicker)
  const [user, setUser] = useState<User | null | undefined>(() => auth.currentUser ?? undefined);

  useEffect(() => {
    const unsub = onAuthStateChangedFirebase((u) => setUser(u));
    return unsub;
  }, []);

  return user;
}

/**
 * Chráni podstrom. Keď user === null, presmeruje na /login.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const user = useUser();
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    if (user === null && loc.pathname !== "/login") {
      nav("/login", { replace: true, state: { from: loc } });
    }
  }, [user, nav, loc]);

  if (user === undefined) {
    // dobrovoľne nechaj loader, aby si videl, že žije
    return <div style={{ padding: 24, textAlign: "center" }}>Načítavam…</div>;
  }
  if (user === null) return null; // práve sa presmerúva
  return <>{children}</>;
}

