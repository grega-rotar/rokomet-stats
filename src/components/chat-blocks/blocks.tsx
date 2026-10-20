"use client";

import { createContext, memo, useContext, useMemo, useRef, type ComponentProps, type ReactNode, type Ref } from "react";
import type { ExtraProps } from "react-markdown";
import { Court2D } from "@/components/court/court-2d";
import { CourtScene, CourtSkeleton } from "@/components/court/court-scene";
import { GoalView } from "@/components/goal/goal-view";
import { BLOCKS, fenceClosed, goalData, parseCourt, parseGoal, type BlockLang, type CourtBlock, type GoalBlock } from "./parse";
import { useInView, useLiveSlot } from "./live";

// ```court and ```goal fences in Claude's answers, drawn instead of shown as code. Spec: specs/chat-blocks.md.

/** The Markdown source of the answer, so a fence can tell whether it is closed yet. */
export const AnswerSource = createContext<{ text: string; streaming: boolean }>({ text: "", streaming: false });

const isBlock = (lang: string): lang is BlockLang => (BLOCKS as readonly string[]).includes(lang);

/** react-markdown `pre`: fenced code. Our blocks are drawn, everything else stays a code block. */
export function Pre({ node, ...props }: ComponentProps<"pre"> & ExtraProps) {
  const src = useContext(AnswerSource);
  const code = node?.children[0];
  if (!code || code.type !== "element" || code.tagName !== "code") return <pre {...props} />;
  const cls = ([] as unknown[]).concat(code.properties.className ?? []).map(String);
  const lang = cls.find((c) => c.startsWith("language-"))?.slice(9) ?? "";
  const text = code.children.map((c) => (c.type === "text" ? c.value : "")).join("");
  const pos = node?.position;
  const open = src.streaming && (!pos || !fenceClosed(src.text, pos.start.offset ?? 0, pos.end.offset ?? src.text.length));
  if (isBlock(lang)) return open ? <Drawing lang={lang} /> : <Block lang={lang} text={text} />;
  // the language name is still arriving ("```cou")
  if (open && !text && BLOCKS.some((b) => lang && b.startsWith(lang))) return <Drawing lang={lang.startsWith("c") ? "court" : "goal"} />;
  return <pre {...props} />;
}

const Block = memo(function Block({ lang, text }: { lang: BlockLang; text: string }) {
  const parsed = useMemo(() => (lang === "court" ? parseCourt(text) : parseGoal(text)), [lang, text]);
  if (!parsed.ok) return <Broken text={text} lang={lang} error={parsed.error} />;
  return lang === "court" ? <Court block={parsed.value as CourtBlock} /> : <Goal block={parsed.value as GoalBlock} />;
});

function Shell({ title, tag, children, ref }: { title: string; tag: string; children: ReactNode; ref?: Ref<HTMLElement> }) {
  return (
    <figure ref={ref} className="my-1 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-line">
      <figcaption className="mb-2.5 flex items-center gap-2 px-1">
        <span className="min-w-0 flex-1 truncate font-display text-sm font-bold text-slate">{title}</span>
        <span className="shrink-0 rounded-full bg-floor px-2 py-0.5 text-[11px] font-semibold text-muted">{tag}</span>
      </figcaption>
      {children}
    </figure>
  );
}

const COURT_H = "clamp(220px, 62vw, 380px)";

function Court({ block }: { block: CourtBlock }) {
  const ref = useRef<HTMLElement>(null);
  const [live, promote] = useLiveSlot(useInView(ref));
  return (
    <Shell ref={ref} title={block.title ?? "Court diagram"} tag="illustration">
      {live ? (
        <CourtScene scene={block.scene} compact height={COURT_H} />
      ) : (
        <button
          type="button"
          onClick={promote}
          className="group relative block w-full overflow-hidden rounded-2xl bg-[#e4e9ef] ring-1 ring-line"
          style={{ height: COURT_H }}
          aria-label="Play the diagram"
        >
          <Court2D scene={block.scene} label={block.title ?? "Court diagram"} />
          <span className="absolute inset-0 grid place-items-center bg-slate-deep/0 transition group-hover:bg-slate-deep/10">
            <span className="grid size-12 place-items-center rounded-full bg-slate text-white shadow-lg transition group-hover:scale-105">
              <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden><path d="M8 5.5v13l11-6.5z" /></svg>
            </span>
          </span>
        </button>
      )}
    </Shell>
  );
}

function Goal({ block }: { block: GoalBlock }) {
  const ref = useRef<HTMLElement>(null);
  const [live] = useLiveSlot(useInView(ref));
  const data = useMemo(() => goalData(block), [block]);
  return (
    <Shell ref={ref} title={block.title ?? "Goal zones"} tag={block.mode === "scored" ? "goals scored" : "goals conceded"}>
      <GoalView data={data} live={live} height={300} />
      <p className="mt-2 text-center text-[11px] text-muted">shooter&apos;s view · 7m not included</p>
    </Shell>
  );
}

function Drawing({ lang }: { lang: BlockLang }) {
  return (
    <Shell title={lang === "court" ? "Drawing court…" : "Drawing goal…"} tag={lang === "court" ? "illustration" : "goal zones"}>
      <div className="relative overflow-hidden rounded-2xl ring-1 ring-line" style={{ height: lang === "court" ? COURT_H : 300 }}>
        {lang === "court" ? <CourtSkeleton /> : <div className="court-shimmer absolute inset-0" />}
      </div>
    </Shell>
  );
}

function Broken({ text, lang, error }: { text: string; lang: string; error: string }) {
  return (
    <details className="group rounded-xl bg-floor px-3.5 py-2.5 text-sm ring-1 ring-line">
      <summary className="cursor-pointer list-none text-muted marker:hidden">
        <span className="mr-1.5 inline-block transition group-open:rotate-90">›</span>
        Couldn&apos;t draw this diagram
      </summary>
      <p className="mt-2 text-xs text-muted">{error.split("\n")[0]}</p>
      <pre className="mt-2">
        <code className={`language-${lang}`}>{text}</code>
      </pre>
    </details>
  );
}
