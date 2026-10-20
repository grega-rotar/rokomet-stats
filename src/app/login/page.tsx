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
    <main className="flex h-full items-center justify-center bg-[radial-gradient(ellipse_at_top,_#dbeef9,_transparent_60%)] p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-line bg-white p-7 shadow-xl shadow-slate/5">
        <Wordmark />
        <h1 className="mt-7 font-display text-xl font-bold text-slate">Welcome back</h1>
        <p className="mt-1 text-sm text-muted">Enter the team password to open the chats.</p>
        <label className="mt-6 block">
          <span className="text-sm font-semibold text-slate">Password</span>
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 w-full rounded-xl border no-ring border-line bg-white px-3.5 py-2.5 outline-none transition focus:border-sky focus:ring-4 focus:ring-sky/15"
          />
        </label>
        {error && <p className="mt-3 rounded-lg bg-foul/10 px-3 py-2 text-sm text-foul">{error}</p>}
        <button
          disabled={busy || !password}
          className="mt-5 w-full rounded-xl bg-sky px-3 py-2.5 font-semibold text-white shadow-sm transition hover:bg-sky-dark disabled:opacity-50"
        >
          {busy ? "Logging in…" : "Log in"}
        </button>
      </form>
    </main>
  );
}
