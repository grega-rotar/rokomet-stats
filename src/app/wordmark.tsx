// Two slanted panels in the RZS colours, like the angled logo plate on livestat.rokometna-zveza.si.
export function Wordmark() {
  return (
    <span className="inline-flex font-display text-base font-extrabold uppercase tracking-wide">
      <span className="skew-panel bg-sky px-4 py-1.5 text-white">
        <span>Rokomet</span>
      </span>
      <span className="skew-panel bg-court px-3 py-1.5 text-slate-deep">
        <span>Stats</span>
      </span>
    </span>
  );
}
