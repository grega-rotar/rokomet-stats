"use client";

// The competition picker: a grouped menu like RZS "Pregled tekmovanj", with a filter box and keys.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { fold } from "@/lib/stats/groups";

export type PickerCompetition = {
  id: number;
  name: string;
  short: string;
  matches: number;
  /** The top league of its group (Liga NLB), listed first. */
  top: boolean;
  group: { key: string; label: string; order: number };
};

export function CompetitionPicker({
  competitions,
  seasons,
  seasonId,
  compId,
}: {
  competitions: PickerCompetition[];
  seasons: { id: number; name: string }[];
  seasonId: number;
  compId?: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = competitions.find((c) => c.id === compId);
  const href = (id: number) => `/stats?season=${seasonId}&comp=${id}`;

  const filtered = useMemo(() => {
    const q = fold(query.trim());
    return competitions
      .filter((c) => !q || fold(`${c.name} ${c.group.label}`).includes(q))
      .sort(
        (a, b) =>
          a.group.order - b.group.order ||
          Number(b.top) - Number(a.top) ||
          a.short.localeCompare(b.short, "sl", { numeric: true }),
      );
  }, [competitions, query]);

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; items: PickerCompetition[] }>();
    for (const c of filtered) {
      if (!map.has(c.group.key)) map.set(c.group.key, { label: c.group.label, items: [] });
      map.get(c.group.key)!.items.push(c);
    }
    return [...map.values()];
  }, [filtered]);

  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => !rootRef.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [open]);

  function toggle() {
    setOpen((o) => !o);
    setQuery("");
    setActive(0);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") setOpen(false);
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filtered[active]) {
      e.preventDefault();
      setOpen(false);
      router.push(href(filtered[active].id));
    }
  }

  return (
    <div ref={rootRef} className="relative mb-6" onKeyDown={onKey}>
      <div className="flex flex-wrap items-stretch gap-2">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-haspopup="dialog"
          className={`flex min-w-0 flex-1 items-center gap-3 rounded-xl bg-white px-4 py-2.5 text-left shadow-sm ring-1 transition sm:flex-none ${
            open ? "ring-2 ring-sky" : "ring-line hover:ring-sky/50"
          }`}
        >
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-sky-dark">{current?.group.label ?? "Competition"}</span>
            <span className="block truncate font-semibold text-slate">{current?.short ?? "Choose a competition"}</span>
          </span>
          <svg viewBox="0 0 24 24" className={`ml-auto h-4 w-4 shrink-0 text-muted transition ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <label className="relative">
          <span className="sr-only">Season</span>
          <select
            value={seasonId}
            onChange={(e) => router.push(`/stats?season=${e.target.value}`)}
            className="no-ring h-full appearance-none rounded-xl bg-white py-3 pl-4 pr-9 text-sm font-semibold text-slate shadow-sm ring-1 ring-line outline-none transition hover:ring-sky/50 focus:ring-2 focus:ring-sky"
          >
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <svg viewBox="0 0 24 24" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </label>
      </div>

      {open && (
        <div role="dialog" aria-label="Choose a competition" className="absolute inset-x-0 top-full z-30 mt-2 rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
          <div className="border-b border-line p-3">
            <div className="flex items-center gap-2 rounded-xl bg-floor px-3">
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
              <input
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                placeholder="Filter, e.g. M17, pokal, ženske"
                aria-label="Filter competitions"
                className="no-ring min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none"
              />
              <span className="hidden text-xs text-muted sm:inline">↑↓ Enter · Esc</span>
            </div>
          </div>
          <div className="max-h-[min(65vh,560px)] overflow-y-auto overscroll-contain p-4">
            {groups.length === 0 && <p className="px-2 py-6 text-center text-sm text-muted">No competition matches &ldquo;{query}&rdquo;.</p>}
            <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
              {groups.map((g) => (
                <section key={g.label} className="min-w-0">
                  <h3 className="mb-1.5 px-2 text-[0.7rem] font-semibold uppercase tracking-wider text-muted">{g.label}</h3>
                  <ul>
                    {g.items.map((c) => {
                      const index = filtered.indexOf(c);
                      const selected = c.id === compId;
                      return (
                        <li key={c.id}>
                          <Link
                            href={href(c.id)}
                            onClick={() => setOpen(false)}
                            onMouseEnter={() => setActive(index)}
                            className={`flex items-baseline gap-2 rounded-lg px-2 py-1.5 text-sm transition ${
                              index === active ? "bg-floor" : ""
                            } ${selected ? "font-semibold text-sky-dark" : "text-ink"}`}
                          >
                            <span className="min-w-0 flex-1">{c.short}</span>
                            <span className="shrink-0 text-xs text-muted tabular-nums">{c.matches}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
