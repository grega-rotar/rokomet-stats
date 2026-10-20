"use client";

// Players and teams as you type; arrows + Enter open one without a page reload.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Hit = { kind: "player" | "team"; id: number; name: string; meta: string };

export function SearchBox() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced fetch; a newer query aborts the older one.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/stats/search?q=${encodeURIComponent(term)}`, { signal: abort.signal });
        const data = (await res.json()) as { hits: Hit[] };
        setHits(data.hits);
        setActive(0);
      } catch {
        if (!abort.signal.aborted) setHits([]);
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [q]);

  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => !rootRef.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [open]);

  // "/" focuses the search from anywhere on the stats pages.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const shown = q.trim().length >= 2 ? hits : [];

  function go(hit: Hit) {
    setOpen(false);
    setQ("");
    setHits([]);
    inputRef.current?.blur();
    router.push(`/stats/${hit.kind === "player" ? "players" : "teams"}/${hit.id}`);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && shown[active]) {
      e.preventDefault();
      go(shown[active]);
    }
  }

  const teams = shown.filter((h) => h.kind === "team");
  const players = shown.filter((h) => h.kind === "player");

  return (
    <div ref={rootRef} className="relative w-full max-w-sm" onKeyDown={onKey}>
      <div className="flex items-center gap-2 rounded-xl bg-floor px-3 ring-1 ring-transparent transition focus-within:bg-white focus-within:ring-sky">
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search players and teams"
          aria-label="Search players and teams"
          role="combobox"
          aria-expanded={open && shown.length > 0}
          aria-controls="stats-search-results"
          className="no-ring min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"
        />
        {loading ? (
          <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-muted/30 border-t-sky" />
        ) : (
          <kbd className="hidden rounded border border-line bg-white px-1.5 text-[0.7rem] text-muted md:inline">/</kbd>
        )}
      </div>

      {open && q.trim().length >= 2 && (
        <div
          id="stats-search-results"
          role="listbox"
          className="absolute right-0 top-full z-40 mt-2 w-[min(28rem,calc(100vw-2rem))] overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5"
        >
          {shown.length === 0 && !loading && (
            <p className="px-4 py-5 text-sm text-muted">Nothing found for &ldquo;{q.trim()}&rdquo;.</p>
          )}
          <div className="max-h-[60vh] overflow-y-auto overscroll-contain p-1.5">
            {[
              { label: "Teams", items: teams },
              { label: "Players", items: players },
            ].map(
              (g) =>
                g.items.length > 0 && (
                  <div key={g.label} className="py-1">
                    <div className="px-2.5 pb-1 text-[0.7rem] font-semibold uppercase tracking-wider text-muted">{g.label}</div>
                    {g.items.map((h) => {
                      const index = shown.indexOf(h);
                      return (
                        <button
                          key={`${h.kind}-${h.id}`}
                          role="option"
                          aria-selected={index === active}
                          onMouseEnter={() => setActive(index)}
                          onClick={() => go(h)}
                          className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition ${index === active ? "bg-floor" : ""}`}
                        >
                          <span
                            className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold ${
                              h.kind === "team" ? "bg-slate text-white" : "bg-sky/15 text-sky-dark"
                            }`}
                          >
                            {initials(h.name)}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-ink">{h.name}</span>
                            <span className="block truncate text-xs text-muted">{h.meta}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter((w) => /^\p{L}/u.test(w) && !/^(RK|RD|MRK|ŠRD|DRŠ)$/i.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}
