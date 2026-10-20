"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Wordmark } from "../wordmark";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      router.replace("/");
      return;
    }
    setError((await res.json().catch(() => null))?.error ?? "Login failed.");
    setBusy(false);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="h-1.5 bg-court" />
      <header className="flex h-16 items-center bg-slate px-6">
        <Wordmark />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-[12vh]">
        <form onSubmit={submit} className="w-full max-w-sm border border-line bg-white shadow-sm">
          <h1 className="border-l-4 border-sky px-5 py-4 font-display text-sm font-bold uppercase tracking-wide text-slate">
            Log in
          </h1>
          <div className="space-y-4 border-t border-line px-5 py-5">
            <label className="block space-y-1.5">
              <span className="font-display text-xs font-semibold uppercase tracking-wide text-muted">Password</span>
              <input
                type="password"
                autoFocus
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-line bg-white px-3 py-2 outline-none focus:border-sky"
              />
            </label>
            {error && <p className="border-l-4 border-foul bg-foul/5 px-3 py-2 text-sm text-foul">{error}</p>}
            <button
              disabled={busy || !password}
              className="w-full bg-sky px-3 py-2.5 font-display text-sm font-bold uppercase tracking-wide text-white hover:bg-sky-dark disabled:opacity-50"
            >
              {busy ? "Logging in…" : "Log in"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
