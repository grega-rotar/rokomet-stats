import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { MenuButton } from "../../shell";
import { DiagramViewer } from "./viewer";

// The draw.io files in docs/diagrams (copied into the image, see Dockerfile), shown in the app.
const DIAGRAMS = [
  { key: "infrastructure", title: "Infrastructure", about: "Cloudflare, the t4a server, the containers, volumes and outside services." },
  { key: "data-pipeline", title: "Data pipeline", about: "How the crawler turns the RZS API into stats.db, with the checks, and who reads it." },
  { key: "deploy", title: "Deploy", about: "From a push to main to the running server: checks, image, deploy, health check." },
] as const;

function read(key: string): string | null {
  try {
    return fs.readFileSync(path.join(/*turbopackIgnore: true*/ process.cwd(), "docs", "diagrams", `${key}.drawio`), "utf8");
  } catch {
    return null;
  }
}

export default function DiagramsPage({ searchParams }: PageProps<"/diagrams">) {
  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-white/80 px-3 backdrop-blur md:px-6">
        <MenuButton />
        <h1 className="min-w-0 flex-1 truncate font-display text-[0.95rem] font-semibold text-slate">How it works</h1>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8">
          <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-white/60 ring-1 ring-line motion-reduce:animate-none" />}>
            <Diagram searchParams={searchParams} />
          </Suspense>
        </div>
      </div>
    </>
  );
}

async function Diagram({ searchParams }: { searchParams: PageProps<"/diagrams">["searchParams"] }) {
  await connection();
  const asked = (await searchParams).d;
  const current = DIAGRAMS.find((d) => d.key === asked) ?? DIAGRAMS[0];
  const xml = read(current.key);

  return (
    <>
          <nav className="mb-4 flex flex-wrap gap-1.5" aria-label="Diagram">
            {DIAGRAMS.map((d) => (
              <Link
                key={d.key}
                href={`/diagrams?d=${d.key}`}
                aria-current={d.key === current.key ? "page" : undefined}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 transition ${d.key === current.key ? "bg-slate text-white ring-slate" : "bg-white text-slate ring-line hover:ring-sky"}`}
              >
                {d.title}
              </Link>
            ))}
          </nav>
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
            <p className="text-muted">{current.about}</p>
            {xml && (
              <a
                href={`data:application/xml;charset=utf-8,${encodeURIComponent(xml)}`}
                download={`${current.key}.drawio`}
                className="rounded-xl bg-white px-3 py-1.5 text-sm font-semibold text-slate shadow-sm ring-1 ring-line hover:ring-sky"
              >
                Download .drawio
              </a>
            )}
          </div>
          {xml ? (
            <DiagramViewer key={current.key} xml={xml} title={current.title} />
          ) : (
            <p className="rounded-2xl bg-white p-6 text-muted ring-1 ring-line">
              The diagram file docs/diagrams/{current.key}.drawio isn&apos;t on this server.
            </p>
          )}
          <p className="mt-3 text-xs text-muted">Scroll or use the toolbar to zoom; the expand button opens it full screen. Edit the file in app.diagrams.net.</p>
    </>
  );
}
