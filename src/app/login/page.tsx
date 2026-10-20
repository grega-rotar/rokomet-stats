"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
    <main className="flex h-full items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border border-black/10 p-6 dark:border-white/15">
        <h1 className="text-xl font-semibold">Rokomet stats</h1>
        <label className="block space-y-1">
          <span className="text-sm opacity-70">Password</span>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 outline-none focus:border-blue-500 dark:border-white/20"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          disabled={busy || !password}
          className="w-full rounded-lg bg-blue-600 px-3 py-2 font-medium text-white disabled:opacity-50"
        >
          {busy ? "Logging in…" : "Log in"}
        </button>
      </form>
    </main>
  );
}
