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
