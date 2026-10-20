"use client";

// Our own dropdown, used instead of <select> on the stats pages: labels with a hint line,
// groups, an optional filter box, arrow keys / Enter / Esc and type-to-jump.
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { fold } from "@/lib/stats/groups";

export type Option = { value: string; label: string; hint?: string; group?: string };

export function Select({
  label,
  value,
  options,
  onChange,
  searchable = false,
  busy = false,
  className = "",
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  searchable?: boolean;
  busy?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const listId = useId();
  const current = options.find((o) => o.value === value);

  const shown = useMemo(() => {
    const q = fold(query.trim());
    return q ? options.filter((o) => fold(`${o.label} ${o.hint ?? ""} ${o.group ?? ""}`).includes(q)) : options;
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => !rootRef.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function openList() {
    setQuery("");
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  }

  function choose(o: Option) {
    setOpen(false);
    triggerRef.current?.focus();
    if (o.value !== value) onChange(o.value);
  }

  function onKey(e: React.KeyboardEvent) {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (shown[active]) choose(shown[active]);
    } else if (e.key === "Tab") {
      setOpen(false);
    } else if (!searchable && e.key.length === 1) {
      // Type the first letters to jump, like a native select.
      const now = e.timeStamp;
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : "") + fold(e.key), at: now };
      const hit = shown.findIndex((o) => fold(o.label).startsWith(typed.current.text));
      if (hit >= 0) setActive(hit);
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`} onKeyDown={onKey}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openList())}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        className={`flex h-full w-full items-center gap-3 rounded-xl bg-white px-4 py-2.5 text-left shadow-sm ring-1 transition ${
          open ? "ring-2 ring-sky" : "ring-line hover:ring-sky/50"
        }`}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold text-sky-dark">{label}</span>
          <span className="block truncate font-semibold text-slate">{current?.label ?? "—"}</span>
        </span>
        {busy ? (
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-muted/30 border-t-sky" />
        ) : (
          <svg viewBox="0 0 24 24" className={`h-4 w-4 shrink-0 text-muted transition ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 9l6 6 6-6" />
          </svg>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 w-max min-w-full max-w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
          {searchable && (
            <div className="border-b border-line p-2">
              <input
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                placeholder="Filter…"
                aria-label={`Filter ${label.toLowerCase()}`}
                className="no-ring w-full rounded-lg bg-floor px-3 py-2 text-sm outline-none"
              />
            </div>
          )}
          <div ref={listRef} id={listId} role="listbox" aria-label={label} tabIndex={-1} className="max-h-[min(60vh,420px)] overflow-y-auto overscroll-contain p-1.5">
            {shown.length === 0 && <p className="px-3 py-4 text-sm text-muted">Nothing matches &ldquo;{query}&rdquo;.</p>}
            {shown.map((o, i) => {
              const header = o.group && o.group !== shown[i - 1]?.group ? o.group : null;
              const selected = o.value === value;
              return (
                <div key={o.value || "_all"}>
                  {header && (
                    <div className="px-3 pb-1 pt-3 text-[0.7rem] font-semibold uppercase tracking-wider text-muted first:pt-1.5">{header}</div>
                  )}
                  <div
                    role="option"
                    aria-selected={selected}
                    data-index={i}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(o)}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2 transition ${i === active ? "bg-floor" : ""}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm ${selected ? "font-semibold text-sky-dark" : "text-ink"}`}>{o.label}</span>
                      {o.hint && <span className="block text-xs text-muted">{o.hint}</span>}
                    </span>
                    {selected && (
                      <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-sky-dark" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M5 12l5 5L20 7" />
                      </svg>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * A Select that changes one query parameter of the page (no form, no reload).
 * `params` is the page's current query; `reset` lists params that stop making sense
 * after this one changes (a new season has other competition ids).
 */
export function ParamSelect({
  path,
  param,
  params,
  reset = [],
  ...props
}: {
  path: string;
  param: string;
  params: Record<string, string | undefined>;
  reset?: string[];
  label: string;
  value: string;
  options: Option[];
  searchable?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Select
      {...props}
      busy={pending}
      onChange={(v) => {
        const next = new URLSearchParams();
        for (const [k, val] of Object.entries({ ...params, [param]: v })) {
          if (val && !reset.includes(k)) next.set(k, val);
        }
        start(() => router.push(`${path}${next.size ? `?${next}` : ""}`, { scroll: false }));
      }}
    />
  );
}
