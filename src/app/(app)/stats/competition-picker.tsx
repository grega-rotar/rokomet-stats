"use client";

// The competition picker: a grouped menu like RZS "Pregled tekmovanj", with a filter box and keys.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { describeCompetition, fold } from "@/lib/stats/groups";
import { Select } from "./select";
import { Facts, type Fact } from "./ui";

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
  description,
  facts = [],
  basePath = "/stats",
}: {
  competitions: PickerCompetition[];
  seasons: { id: number; name: string }[];
  seasonId: number;
  compId?: number;
  description?: string;
  facts?: Fact[];
  /** The page the picker navigates on: /stats (overview) or /stats/teams. */
  basePath?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = competitions.find((c) => c.id === compId);
  const href = (id: number) => `${basePath}?season=${seasonId}&comp=${id}`;

  const filtered = useMemo(() => {
    const q = fold(query.trim());
    return competitions
      .filter((c) => !q || fold(`${c.name} ${c.group.label} ${describeCompetition(c.name)}`).includes(q))
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
    if (!open) return; // keys in the season dropdown bubble up here too
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
    <div className="mb-6">
    <div ref={rootRef} className="relative" onKeyDown={onKey}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-sky-dark">{current?.group.label ?? "Competitions"}</div>
          {/* The title is the picker: click it to choose another competition. */}
          <h1 className="-mx-2">
            <button
              type="button"
              onClick={toggle}
              aria-expanded={open}
              aria-haspopup="dialog"
              className={`group flex max-w-full items-center gap-2.5 rounded-xl px-2 py-0.5 text-left transition ${
                open ? "bg-white shadow-sm ring-2 ring-sky" : "hover:bg-white hover:shadow-sm hover:ring-1 hover:ring-line"
              }`}
            >
              <span className="truncate font-display text-2xl font-bold tracking-tight text-slate md:text-3xl">
                {current?.short ?? "Choose a competition"}
              </span>
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-slate shadow-sm ring-1 transition ${open ? "ring-sky" : "ring-line group-hover:ring-sky/50"}`}>
                <svg viewBox="0 0 24 24" className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </span>
            </button>
          </h1>
          {description && <div className="mt-1 text-muted">{description}</div>}
        </div>
        <Select
          label="Season"
          value={String(seasonId)}
          options={seasons.map((x) => ({ value: String(x.id), label: x.name }))}
          onChange={(v) => router.push(`${basePath}?season=${v}`, { scroll: false })}
          className="w-40"
        />
      </div>

      {open && (
        <>
        {/* Dims the page under the menu; a click on it closes the menu (the outside-click handler). */}
        <div className="fixed inset-0 z-20 bg-slate/10 backdrop-blur-[1px]" aria-hidden />
        <div
          role="dialog"
          aria-label="Choose a competition"
          className="absolute inset-x-0 top-full z-30 mt-2 flex max-h-[min(70vh,600px)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 max-sm:fixed max-sm:inset-x-3 max-sm:top-16 max-sm:mt-0 max-sm:max-h-[calc(100dvh-5rem)]"
        >
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
                placeholder="Filter, e.g. U17, cup, ženske, east"
                aria-label="Filter competitions"
                className="no-ring min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none"
              />
              <span className="hidden text-xs text-muted sm:inline">↑↓ Enter · Esc</span>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
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
                            className={`flex items-baseline gap-2 rounded-lg px-2 py-1.5 transition ${index === active ? "bg-floor" : ""}`}
                          >
                            <span className="min-w-0 flex-1">
                              <span className={`block text-sm ${selected ? "font-semibold text-sky-dark" : "text-ink"}`}>{c.short}</span>
                              <span className="block text-xs text-muted">{describeCompetition(c.name)}</span>
                            </span>
                            <span className="shrink-0 text-xs text-muted tabular-nums" title="Matches played">{c.matches}</span>
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
        </>
      )}
    </div>
    <Facts items={facts} />
    </div>
  );
}
