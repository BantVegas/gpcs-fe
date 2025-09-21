import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChangedFirebase } from "@/firebase";
import type { User } from "firebase/auth";

const Ctx = createContext<User | null>(null);
export const useUser = () => useContext(Ctx);

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChangedFirebase((u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  if (loading) {
    return <div style={{ padding: 24 }}>Načítavam…</div>;
  }
  return <Ctx.Provider value={user}>{children}</Ctx.Provider>;
}

