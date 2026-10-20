"use client";

// The app frame: a dark sidebar (chats + pages) next to whatever page is open.
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Icon, IconButton } from "./chat/parts";
import { api, type ChatSummary } from "./chat/use-chat";
import { Wordmark } from "./wordmark";

type Chats = {
  chats: ChatSummary[];
  reload: () => Promise<ChatSummary[]>;
  rename: (id: string, title: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** While a reply streams, the sidebar doesn't switch chats. */
  setBusy: (busy: boolean) => void;
  openNav: () => void;
};

const ChatsContext = createContext<Chats | null>(null);

export function useChats() {
  const ctx = useContext(ChatsContext);
  if (!ctx) throw new Error("useChats() needs <Shell>");
  return ctx;
}

const PAGES = [
  { href: "/stats", label: "Stats", exact: true, icon: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /> },
  { href: "/stats/rankings", label: "Rankings", exact: false, icon: <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4zM17 6h3v2a3 3 0 01-3 3M7 6H4v2a3 3 0 003 3" /> },
  { href: "/stats/teams", label: "Teams", exact: true, icon: <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /> },
  { href: "/stats/near", label: "Near you", exact: false, icon: <path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11zM12 12a2 2 0 100-4 2 2 0 000 4z" /> },
  { href: "/stats/data", label: "Data quality", exact: false, icon: <path d="M9 12l2 2 4-4M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4z" /> },
  { href: "/stats/alerts", label: "Alerts", exact: false, icon: <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" /> },
  { href: "/stats/crawl", label: "Crawler", exact: false, icon: <path d="M4 12a8 8 0 0114-5.3M20 12a8 8 0 01-14 5.3M18 3v4h-4M6 21v-4h4" /> },
  { href: "/diagrams", label: "How it works", exact: false, icon: <path d="M3 3h7v7H3zM14 14h7v7h-7zM10 6.5h4a3 3 0 013 3V14M6.5 10v4a3 3 0 003 3H14" /> },
] as const;

/** The ☰ button for a page's own top bar; opens the sidebar on phones. */
export function MenuButton() {
  const { openNav } = useChats();
  return (
    <IconButton label="Open menu" onClick={openNav} className="-ml-1 text-slate hover:bg-floor md:hidden">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </IconButton>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [deleting, setDeleting] = useState<ChatSummary | null>(null);

  const reload = useCallback(async () => {
    const { chats } = await api<{ chats: ChatSummary[] }>("/api/chats");
    setChats(chats);
    return chats;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await reload();
      } catch {}
    })();
  }, [reload]);

  const rename = useCallback(
    async (id: string, title: string) => {
      setChats((list) => list.map((c) => (c.id === id ? { ...c, title } : c)));
      await api(`/api/chats/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      }).catch(() => reload());
    },
    [reload],
  );

  // Asks first; the dialog below does the actual delete.
  const remove = useCallback(
    async (id: string) => setDeleting(chats.find((c) => c.id === id) ?? null),
    [chats],
  );

  async function confirmDelete(id: string) {
    setDeleting(null);
    await api(`/api/chats/${id}`, { method: "DELETE" });
    await reload();
    if (new URLSearchParams(window.location.search).get("c") === id) router.replace("/");
  }

  const value = useMemo(
    () => ({ chats, reload, rename, remove, setBusy, openNav: () => setNavOpen(true) }),
    [chats, reload, rename, remove],
  );

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <ChatsContext.Provider value={value}>
      <div className="flex h-full overflow-hidden">
        {navOpen && <div className="fixed inset-0 z-20 bg-slate-deep/40 md:hidden" onClick={() => setNavOpen(false)} />}
        <aside
          className={`fixed inset-y-0 left-0 z-30 flex w-72 shrink-0 flex-col bg-slate-deep text-white transition-transform duration-200 md:static md:translate-x-0 ${
            navOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between px-4 pb-4 pt-5">
            <Link href="/" aria-label="Rokomet stats home">
              <Wordmark dark />
            </Link>
            <IconButton label="Close menu" onClick={() => setNavOpen(false)} className="text-white/70 hover:bg-white/10 md:hidden">
              <path d="M6 6l12 12M18 6L6 18" />
            </IconButton>
          </div>

          <div className="px-3">
            <Link
              href="/"
              onClick={(e) => {
                if (busy) e.preventDefault();
                setNavOpen(false);
              }}
              aria-disabled={busy}
              className={`flex w-full items-center gap-2 rounded-xl bg-sky px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-dark ${
                busy ? "pointer-events-none opacity-50" : ""
              }`}
            >
              <Icon className="h-4 w-4">
                <path d="M12 5v14M5 12h14" />
              </Icon>
              New chat
            </Link>
            <Suspense fallback={null}>
              <PageNav onNavigate={() => setNavOpen(false)} />
            </Suspense>
          </div>

          <Suspense fallback={<div className="flex-1" />}>
            <ChatList chats={chats} busy={busy} onNavigate={() => setNavOpen(false)} />
          </Suspense>

          <div className="border-t border-white/10 p-3">
            <button
              onClick={logout}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-white/60 transition hover:bg-white/5 hover:text-white"
            >
              <Icon className="h-4 w-4">
                <path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 17l-5-5 5-5M5 12h11" />
              </Icon>
              Log out
            </button>
          </div>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</main>
      </div>
      {deleting && (
        <ConfirmDialog
          title="Delete chat?"
          confirmLabel="Delete"
          onConfirm={() => confirmDelete(deleting.id)}
          onCancel={() => setDeleting(null)}
        >
          <span className="font-medium text-ink">{deleting.title}</span> will be gone for good.
        </ConfirmDialog>
      )}
    </ChatsContext.Provider>
  );
}

function ConfirmDialog({
  title,
  confirmLabel,
  onConfirm,
  onCancel,
  children,
}: {
  title: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-deep/50 p-4 backdrop-blur-[2px]" onMouseDown={onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-white p-5 text-ink shadow-2xl ring-1 ring-black/5"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-foul/10 text-foul">
            <Icon className="h-5 w-5">{TRASH}</Icon>
          </span>
          <div className="min-w-0 pt-0.5">
            <h2 id="confirm-title" className="font-semibold">
              {title}
            </h2>
            <p className="mt-1 break-words text-sm text-muted">{children}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            autoFocus
            onClick={onCancel}
            className="rounded-xl px-4 py-2 text-sm font-medium text-slate transition hover:bg-floor"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-xl bg-foul px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-foul/90"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function PageNav({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="mt-3 space-y-0.5" aria-label="Pages">
      {PAGES.map((p) => {
        const active = p.exact ? pathname === p.href : pathname.startsWith(p.href);
        return (
          <Link
            key={p.href}
            href={p.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2.5 rounded-lg px-3.5 py-2 text-sm transition ${
              active ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Icon className="h-4 w-4">{p.icon}</Icon>
            {p.label}
          </Link>
        );
      })}
    </nav>
  );
}

const GROUPS = ["Today", "Yesterday", "Previous 7 days", "Older"] as const;

function groupOf(iso: string): (typeof GROUPS)[number] {
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const t = new Date(iso).getTime();
  if (t >= startOfToday) return "Today";
  if (t >= startOfToday - 864e5) return "Yesterday";
  if (t >= startOfToday - 7 * 864e5) return "Previous 7 days";
  return "Older";
}

function ChatList({ chats, busy, onNavigate }: { chats: ChatSummary[]; busy: boolean; onNavigate: () => void }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const activeId = pathname === "/" ? params.get("c") : null;
  const grouped = GROUPS.map((g) => ({ name: g, chats: chats.filter((c) => groupOf(c.updatedAt) === g) })).filter(
    (g) => g.chats.length > 0,
  );

  return (
    <nav className="dark-scroll mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-white/10 px-3 pb-4 pt-1" aria-label="Chats">
      {chats.length === 0 && <p className="px-3 py-3 text-sm text-white/40">Your chats show up here.</p>}
      {grouped.map((g) => (
        <section key={g.name} className="mt-4 first:mt-3">
          <h2 className="px-3 pb-1.5 text-[0.7rem] font-semibold uppercase tracking-wider text-white/35">{g.name}</h2>
          {g.chats.map((c) => (
            <ChatItem key={c.id} chat={c} active={c.id === activeId} busy={busy} onNavigate={onNavigate} />
          ))}
        </section>
      ))}
    </nav>
  );
}

const PENCIL = <path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16v4zM13.5 6.5l4 4" />;
const TRASH = <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3" />;

function ChatItem({
  chat,
  active,
  busy,
  onNavigate,
}: {
  chat: ChatSummary;
  active: boolean;
  busy: boolean;
  onNavigate: () => void;
}) {
  const { rename, remove } = useChats();
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(chat.title);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const outside = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setMenu(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);

  function commit() {
    setEditing(false);
    const title = value.trim();
    if (title && title !== chat.title) rename(chat.id, title);
    else setValue(chat.title);
  }

  return (
    <div
      ref={ref}
      className={`group relative flex items-center rounded-lg transition ${
        active || menu ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
      }`}
    >
      {active && <span className="absolute left-0 top-1/2 h-4 w-1 -translate-y-1/2 rounded-full bg-court" />}
      {editing ? (
        <input
          autoFocus
          value={value}
          maxLength={100}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setValue(chat.title);
              setEditing(false);
            }
          }}
          aria-label="Chat name"
          className="no-ring mx-1 my-1 min-w-0 flex-1 rounded-md bg-slate-deep px-2 py-1 text-sm text-white outline-none ring-2 ring-sky"
        />
      ) : (
        <Link
          href={`/?c=${chat.id}`}
          onClick={(e) => {
            if (busy) e.preventDefault();
            else onNavigate();
          }}
          onDoubleClick={(e) => {
            e.preventDefault();
            setEditing(true);
          }}
          className="min-w-0 flex-1 truncate px-3 py-2 text-left text-sm"
          title={chat.title}
          aria-current={active ? "page" : undefined}
        >
          {chat.title}
        </Link>
      )}
      {!editing && (
        <IconButton
          label={`Options for ${chat.title}`}
          onClick={() => setMenu((m) => !m)}
          className={`mr-1 text-white/60 hover:bg-white/10 hover:text-white focus-visible:opacity-100 ${
            menu || active ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
          small
        >
          <circle cx="5" cy="12" r="1" fill="currentColor" />
          <circle cx="12" cy="12" r="1" fill="currentColor" />
          <circle cx="19" cy="12" r="1" fill="currentColor" />
        </IconButton>
      )}
      {menu && (
        <div role="menu" className="absolute right-1 top-full z-40 mt-1 w-44 rounded-xl bg-white p-1 text-ink shadow-xl ring-1 ring-black/5">
          <MenuItem
            icon={PENCIL}
            onClick={() => {
              setMenu(false);
              setValue(chat.title);
              setEditing(true);
            }}
          >
            Rename
          </MenuItem>
          <MenuItem
            icon={TRASH}
            danger
            onClick={() => {
              setMenu(false);
              remove(chat.id);
            }}
          >
            Delete
          </MenuItem>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  danger = false,
  onClick,
  children,
}: {
  icon: React.ReactNode;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition ${
        danger ? "text-foul hover:bg-foul/10" : "hover:bg-floor"
      }`}
    >
      <Icon className="h-4 w-4">{icon}</Icon>
      {children}
    </button>
  );
}
