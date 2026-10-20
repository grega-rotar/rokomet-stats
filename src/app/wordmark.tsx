// A handball (circle with two seams) in a rounded RZS-blue tile, then the name.
export function BallIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M6.5 4.8c3.4 2.4 7.6 2.4 11 0M3.6 9.5c4.4.2 7.4 3.7 7.9 11.4M20.4 9.5c-4.4.2-7.4 3.7-7.9 11.4" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ dark = false }: { dark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-sky text-white shadow-sm">
        <BallIcon />
      </span>
      <span className={`font-display text-[0.95rem] font-bold leading-none ${dark ? "text-white" : "text-slate"}`}>
        Rokomet <span className="text-court">stats</span>
      </span>
    </span>
  );
}
