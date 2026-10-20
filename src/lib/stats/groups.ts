// Groups competitions the way RZS does (senior / juniors / cadets / younger, men / women), from the name alone.
// Names end in the category, e.g. "Liga NLB (1. SRL) (Člani)", "M17 1. SRL Kvalifikacije A (M17)".

export type CompetitionGroup = { key: string; label: string; order: number };

const GROUPS: { test: RegExp; group: CompetitionGroup }[] = [
  { test: /\(Člani\)$/, group: { key: "men", label: "Men", order: 0 } },
  { test: /\(Članice\)$/, group: { key: "women", label: "Women", order: 1 } },
  { test: /\((M2\d|M1[89]|Mladinci)\)$|\bmladinci\b/i, group: { key: "m-junior", label: "Juniors · boys (M20)", order: 2 } },
  { test: /\((Ž19|Ž2\d|Mladinke)\)$|\bmladinke\b/i, group: { key: "w-junior", label: "Juniors · girls (Ž19)", order: 3 } },
  { test: /\((M1[67]|Kadeti)\)$|\bkadeti\b/i, group: { key: "m-cadet", label: "Cadets · boys (M17)", order: 4 } },
  { test: /\((Ž1[67]|Kadetinje)\)$|\bkadetinje\b/i, group: { key: "w-cadet", label: "Cadets · girls (Ž17)", order: 5 } },
  { test: /\((M1[2-5])\)$|dečki/i, group: { key: "m-young", label: "Younger boys (M15, M14)", order: 6 } },
  { test: /\((Ž1[2-5])\)$|deklice/i, group: { key: "w-young", label: "Younger girls (Ž15, Ž14)", order: 7 } },
];
const OTHER: CompetitionGroup = { key: "other", label: "Other", order: 8 };

export function competitionGroup(name: string): CompetitionGroup {
  return GROUPS.find((g) => g.test.test(name.trim()))?.group ?? OTHER;
}

/** "Liga NLB (1. SRL) (Člani)" -> "Liga NLB (1. SRL)": the group already says who plays. */
export function shortName(name: string): string {
  return name.replace(/\s*\((Člani|Članice|[MŽ]\d{2})\)\s*$/, "").trim();
}

/** Lower case without č, š, ž accents, so "skofja" finds "ŠKOFJA". */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const REGIONS: Record<string, string> = { CENTER: "Center", VZHOD: "East", ZAHOD: "West", JUG: "South" };
const ORDINAL: Record<string, string> = { "1": "1st", "2": "2nd", "3": "3rd" };

/**
 * A plain-English line for a competition name (terms: specs/handball-glossary.md), e.g.
 * "M17 1. SRL Kvalifikacije A (M17)" -> "U17 · 1st league qualifiers · group A".
 */
export function describeCompetition(name: string): string {
  const n = shortName(name);
  if (/^Liga NLB/i.test(n)) return "Top division";
  if (/^1\.\s*B\s*SRL/i.test(n)) return "Second division";
  if (/^2\.\s*SRL\s*[-–]\s*moški/i.test(n)) return "Third division";
  if (/^1\.\s*SRL\s*[-–]\s*ženske/i.test(n)) return "Top division";
  if (/pokal slovenije/i.test(n)) return "Slovenian Cup";
  if (/super pokal/i.test(n)) return "Super Cup: champion vs cup winner";

  const parts: string[] = [];
  const age = n.match(/^[MŽ](\d{2})\b/);
  if (age) parts.push(`U${age[1]}`);
  const league = n.match(/\b(\d)\.\s*SRL\b/);
  const qualifiers = /kvalifikacije/i.test(n);
  if (league) parts.push(`${ORDINAL[league[1]] ?? `${league[1]}.`} league${qualifiers ? " qualifiers" : ""}`);
  else if (/\bSRT\b/.test(n)) parts.push("regional league");
  else if (qualifiers) parts.push("qualifiers");
  const group = n.match(/kvalifikacije\s+(\S+)/i)?.[1];
  const region = n.match(/\b(CENTER|VZHOD|ZAHOD|JUG)\b(\s+[IV]+)?/i);
  if (group && !REGIONS[group.toUpperCase()]) parts.push(`group ${group}`);
  if (region) parts.push(`${REGIONS[region[1].toUpperCase()]}${region[2] ?? ""}`);
  return parts.join(" · ") || n;
}

const POSITIONS: Record<string, string> = {
  vratar: "Goalkeeper",
  "levi zunanji": "Left back",
  "srednji zunanji": "Centre back",
  "desni zunanji": "Right back",
  "levo krilo": "Left wing",
  "desno krilo": "Right wing",
  "krožni napadalec": "Pivot",
};

/** "Srednji zunanji" -> "Centre back"; unknown positions stay as they are. */
export function positionLabel(position: string): string {
  return POSITIONS[position.trim().toLowerCase()] ?? position;
}

/**
 * RZS writes team names in capitals ("RK CELJE PIVOVARNA LAŠKO"). For display: "RK Celje Pivovarna Laško".
 * Words without a vowel (RK, RD, MRK, ŠRD, LL, NG) are abbreviations and stay in capitals.
 */
export function teamName(name: string): string {
  if (name !== name.toUpperCase()) return name;
  return name
    .toLowerCase()
    .split(/(\s+|-)/)
    .map((w) => (/[aeiou]/i.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w.toUpperCase()))
    .join("");
}
