import type { DrillPlan } from "./plan";

export type StoredPlan = { id: number; seasonId: number; status: "running" | "done" | "error"; createdAt: number; finishedAt: number | null; plan: DrillPlan | null; error: string | null };
export type DrillsResponse = { plan: StoredPlan | null; previous?: StoredPlan };
