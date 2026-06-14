"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

/**
 * Simple access gate. NOTE: this is client-side convenience only — the
 * underlying Google Sheets are published publicly, so it is not real security.
 *
 * Master code 0000 = admin (all teams). Each PATL code locks the dashboard to
 * that Team Leader.
 */
const PASSWORDS: Record<string, string | null> = {
  "0000": null, // admin — all teams
  "1001": "Sean Chamroeun",
  "1002": "Chin Pholly",
  "1003": "Lon Sreypom",
  "1004": "Mao Soklim",
};

interface AuthValue {
  patl: string | null; // null = admin (all teams)
  isAdmin: boolean;
  signOut: () => void;
}
const AuthCtx = createContext<AuthValue>({ patl: null, isAdmin: true, signOut: () => {} });
export const useAuth = () => useContext(AuthCtx);

const STORAGE_KEY = "pa-auth-v1";

export function AuthGate({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(false);
  const [patl, setPatl] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(false);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const j = JSON.parse(saved);
        setAuthed(true);
        setPatl(j.patl ?? null);
      }
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (Object.prototype.hasOwnProperty.call(PASSWORDS, pw)) {
      const p = PASSWORDS[pw];
      setAuthed(true);
      setPatl(p);
      setErr(false);
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ patl: p }));
      } catch {
        /* ignore */
      }
    } else {
      setErr(true);
    }
  };

  const signOut = () => {
    setAuthed(false);
    setPatl(null);
    setPw("");
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  if (!ready) return null;

  if (!authed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <form
          onSubmit={submit}
          className="w-full max-w-xs rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100"
        >
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
            PA
          </div>
          <h1 className="text-center text-sm font-semibold text-slate-800">
            PA Performance Dashboard
          </h1>
          <p className="mb-4 mt-1 text-center text-[11px] text-slate-400">
            Enter your access code
          </p>
          <input
            type="password"
            inputMode="numeric"
            autoFocus
            value={pw}
            onChange={(e) => {
              setPw(e.target.value);
              setErr(false);
            }}
            placeholder="••••"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-center text-lg tracking-widest text-slate-800 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-300"
          />
          {err && (
            <p className="mt-2 text-center text-[11px] text-red-600">
              Incorrect code. Try again.
            </p>
          )}
          <button
            type="submit"
            className="mt-3 w-full rounded-lg bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Enter
          </button>
        </form>
      </div>
    );
  }

  return (
    <AuthCtx.Provider value={{ patl, isAdmin: patl === null, signOut }}>
      {children}
      <button
        onClick={signOut}
        className="fixed bottom-3 left-3 z-50 rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 text-[11px] font-medium text-slate-600 shadow-sm backdrop-blur hover:bg-slate-50"
        title="Sign out"
      >
        🔒 {patl ?? "Admin"} · Sign out
      </button>
    </AuthCtx.Provider>
  );
}
