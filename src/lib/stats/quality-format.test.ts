import { describe, expect, it } from "vitest";
import { auditFieldLabel, checkGroup, checkLabel, formatStamp, kindLabel, pct } from "./quality-format";

describe("data page labels", () => {
  it("groups the per-team zone checks", () => {
    expect(checkGroup("zones_plus_7m_eq_score_home")).toBe("zones_plus_7m_eq_score");
    expect(checkGroup("player_goals_eq_score")).toBe("player_goals_eq_score");
    expect(checkLabel("zones_plus_7m_eq_score_away")).toBe("Zone goals + 7m = score (away)");
    expect(checkLabel("something_new")).toBe("something new");
  });

  it("labels review kinds, including a missing review", () => {
    expect(kindLabel("server_error")).toMatch(/RZS server error/);
    expect(kindLabel(null)).toBe("Waiting for a review");
    expect(kindLabel("new_rule")).toBe("new rule");
  });

  it("labels audit fields", () => {
    expect(auditFieldLabel("home.top_left.goals")).toBe("home top left goals");
    expect(auditFieldLabel("away.7m.shots")).toBe("away 7m attempts");
    expect(auditFieldLabel("home.goals")).toBe("home goals (Skupaj)");
  });

  it("rounds percentages and survives empty totals", () => {
    expect(pct(1, 3)).toBe(33);
    expect(pct(0, 0)).toBeNull();
  });

  it("formats the crawler's timestamps in Ljubljana time", () => {
    expect(formatStamp("2026-10-20T16:41:10+0000")).toBe("20 Oct, 18:41");
    expect(formatStamp(null)).toBe("–");
    expect(formatStamp("garbage")).toBe("garbage");
  });
});
