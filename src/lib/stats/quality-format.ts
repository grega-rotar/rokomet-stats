// Labels and small helpers for /stats/data (no database here, so tests can import it).
// Kinds and check names are written by scripts/review.py and scripts/crawl.py (specs/stats-pipeline.md).

export const KIND_LABELS: Record<string, string> = {
  server_error: "RZS server error, retried next crawl",
  request_failed: "RZS request failed, retried next crawl",
  goal_not_credited: "Goal not credited to any player",
  goalkeeper_goal: "Goalkeeper's goal missing from the player table",
  player_missing: "Scorer missing from the player table",
  player_short: "Player has fewer goals than in the play-by-play",
  no_player_rows: "No player stats (registered result)",
  goals_without_zone: "Goals entered without a zone",
  partial_zones: "Only part of the goals have a zone",
  team_no_zones: "No goal zones for this team",
  competition_no_zones: "Competition without goal zones",
  grid_has_7m: "Zone grid already holds the 7m goals",
  no_pdf: "No stats PDF",
  unexplained: "No rule fits, no PDF to look at",
  ai: "Explained by Claude from the PDF",
};

export function kindLabel(kind: string | null): string {
  if (!kind) return "Waiting for a review";
  return KIND_LABELS[kind] ?? kind.replaceAll("_", " ");
}

export const CHECK_LABELS: Record<string, string> = {
  load: "Match loaded from RZS",
  player_goals_eq_score: "Player goals = score",
  pbp_final_eq_score: "Play-by-play final = score",
  pdf_score_eq_score: "PDF score = score",
  pdf: "PDF readable",
  zones_plus_7m_eq_score: "Zone goals + 7m = score",
};

/** zones_plus_7m_eq_score_home and _away are one check per team; the page shows them together. */
export function checkGroup(name: string): string {
  return name.replace(/_(home|away)$/, "");
}

export function checkLabel(name: string): string {
  const side = name.match(/_(home|away)$/)?.[1];
  const base = CHECK_LABELS[checkGroup(name)] ?? name.replaceAll("_", " ");
  return side ? `${base} (${side})` : base;
}

export function pct(part: number, whole: number): number | null {
  return whole ? Math.round((part / whole) * 100) : null;
}

/** "home.top_left.goals" -> "home top left goals"; "away.7m.shots" -> "away 7m attempts". */
export function auditFieldLabel(field: string): string {
  const [side, what, kind] = field.split(".");
  if (!kind) return `${side} ${what === "goals" ? "goals (Skupaj)" : what}`;
  const k = what === "7m" && kind === "shots" ? "attempts" : kind;
  return `${side} ${what.replaceAll("_", " ")} ${k}`;
}

const TZ = "Europe/Ljubljana";

/** crawl.py / review.py write "2026-10-20T18:41:10+0200"; show it in Slovenian local time. */
export function formatStamp(stamp: string | null | undefined): string {
  if (!stamp) return "–";
  const iso = stamp.replace(/([+-]\d\d)(\d\d)$/, "$1:$2");
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return stamp;
  return d.toLocaleString("en-GB", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
