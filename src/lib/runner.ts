import "server-only";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { Semaphore } from "./semaphore";
import { parseLine, ReplyText } from "./stream-json";

// Rules for the claude-pool processes: specs/architecture.md.

const SYSTEM_PROMPT =
  "You are the assistant of rokomet-stats, a tool for Slovenian handball statistics " +
  "(RZS livestat data). Answer in the language the user writes in. Be concise.";

const EXIT_EXHAUSTED = 75; // claude-pool: every account is at its usage limit

type State = { sem: Semaphore; running: Set<string> };
const g = globalThis as unknown as { __runner?: State };
const state = (g.__runner ??= {
  sem: new Semaphore(Number(process.env.MAX_PARALLEL_RUNS) || 6),
  running: new Set<string>(),
});

export type RunHooks = {
  onWaiting?: () => void;
  onStarted?: () => void;
  onSession?: (sessionId: string) => void;
  onDelta?: (text: string) => void;
};

export type RunResult = {
  ok: boolean;
  text: string;
  error?: string;
  aborted?: boolean;
  costUsd: number | null;
  durationMs: number | null;
};

/** Marks a chat as busy. Returns false if a reply for it is already running (-> 409). */
export function claimChat(chatId: string): boolean {
  if (state.running.has(chatId)) return false;
  state.running.add(chatId);
  return true;
}

export function releaseChat(chatId: string) {
  state.running.delete(chatId);
}

export async function runClaude(opts: {
  chatId: string;
  prompt: string;
  resumeSessionId: string | null;
  signal: AbortSignal;
  hooks: RunHooks;
}): Promise<RunResult> {
  const { chatId, prompt, resumeSessionId, signal, hooks } = opts;
  const empty = { text: "", costUsd: null, durationMs: null };

  if (!state.sem.free) hooks.onWaiting?.();
  let release: () => void;
  try {
    release = await state.sem.acquire(signal);
  } catch {
    return { ok: false, aborted: true, error: "Stopped.", ...empty };
  }

  try {
    hooks.onStarted?.();
    return await spawnClaude({ chatId, prompt, resumeSessionId, signal, hooks });
  } finally {
    release();
  }
}

function spawnClaude(opts: {
  chatId: string;
  prompt: string;
  resumeSessionId: string | null;
  signal: AbortSignal;
  hooks: RunHooks;
}): Promise<RunResult> {
  const { chatId, prompt, resumeSessionId, signal, hooks } = opts;
  const cwd = path.join(/*turbopackIgnore: true*/ process.env.WORK_DIR ?? "./data/work", chatId);
  fs.mkdirSync(cwd, { recursive: true });

  // The prompt goes in on stdin, so user text is never parsed as a command-line flag.
  const args = [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--append-system-prompt",
    SYSTEM_PROMPT,
  ];
  if (resumeSessionId) args.push("--resume", resumeSessionId);
  const tools = process.env.CLAUDE_ALLOWED_TOOLS?.trim();
  if (tools) args.push("--allowedTools", tools);

  return new Promise((resolve) => {
    const child = spawn(/*turbopackIgnore: true*/ process.env.CLAUDE_BIN || "claude-pool", args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
    child.stdin.end(prompt);

    const reply = new ReplyText();
    let result: RunResult | null = null;
    let stderr = "";
    let killedBy: "timeout" | "abort" | null = null;

    const kill = (why: "timeout" | "abort") => {
      if (child.exitCode !== null) return;
      killedBy = why;
      child.kill("SIGTERM");
      setTimeout(() => child.exitCode === null && child.kill("SIGKILL"), 5000).unref();
    };
    const timeoutS = Number(process.env.RUN_TIMEOUT_SECONDS) || 600;
    const timer = setTimeout(() => kill("timeout"), timeoutS * 1000);
    const onAbort = () => kill("abort");
    signal.addEventListener("abort", onAbort, { once: true });

    child.stderr.on("data", (d) => {
      stderr = (stderr + d).slice(-4000);
    });

    readline.createInterface({ input: child.stdout }).on("line", (line) => {
      for (const ev of parseLine(line)) {
        if (ev.type === "session") hooks.onSession?.(ev.sessionId);
        else if (ev.type === "result") {
          const text = reply.text || ev.text;
          result = ev.isError
            ? { ok: false, text, error: ev.text || "Claude returned an error.", costUsd: ev.costUsd, durationMs: ev.durationMs }
            : { ok: true, text, costUsd: ev.costUsd, durationMs: ev.durationMs };
        } else {
          const chunk = reply.add(ev);
          if (chunk) hooks.onDelta?.(chunk);
        }
      }
    });

    const finish = (code: number | null, spawnError?: Error) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      const partial = { text: reply.text, costUsd: null, durationMs: null };
      if (spawnError) return resolve({ ok: false, error: `Could not start Claude: ${spawnError.message}`, ...partial });
      if (killedBy === "abort") return resolve({ ok: false, aborted: true, error: "Stopped.", ...partial });
      if (killedBy === "timeout") return resolve({ ok: false, error: `No answer after ${timeoutS} s.`, ...partial });
      if (result && (code === 0 || !result.ok)) return resolve(result);
      if (code === EXIT_EXHAUSTED) {
        return resolve({ ok: false, error: "All Claude accounts are out of usage. Try again later.", ...partial });
      }
      const detail = stderr.trim().split("\n").slice(-3).join("\n");
      resolve({ ok: false, error: `Claude exited with code ${code}.${detail ? `\n${detail}` : ""}`, ...partial });
    };

    // "close" waits for stdout to be fully read, so the result line is in by then.
    child.on("close", (code) => finish(code));
    child.on("error", (err) => finish(null, err));
  });
}
