"use client";

import { useEffect, useRef, useState } from "react";

// The official diagrams.net viewer (read-only): renders the .drawio XML with zoom, layers and a full-screen view.
const VIEWER = "https://viewer.diagrams.net/js/viewer-static.min.js";

type Viewer = { processElements: () => void };
declare global {
  interface Window {
    GraphViewer?: Viewer;
  }
}

let loading: Promise<void> | null = null;
function loadViewer(): Promise<void> {
  if (window.GraphViewer) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = VIEWER;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error("viewer failed to load"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export function DiagramViewer({ xml, title }: { xml: string; title: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    loadViewer()
      .then(() => {
        const el = host.current;
        if (cancelled || !el || !window.GraphViewer) return;
        el.innerHTML = "";
        const div = document.createElement("div");
        div.className = "mxgraph";
        div.style.maxWidth = "100%";
        div.setAttribute(
          "data-mxgraph",
          JSON.stringify({ xml, toolbar: "zoom layers lightbox", nav: true, resize: true, fit: true, center: true, "toolbar-position": "top" }),
        );
        el.appendChild(div);
        window.GraphViewer.processElements();
        setState("ready");
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, [xml]);

  return (
    <figure className="overflow-hidden rounded-2xl bg-white p-3 shadow-sm ring-1 ring-line md:p-5" aria-label={`${title} diagram`}>
      {state === "loading" && <div className="h-96 animate-pulse rounded-xl bg-floor motion-reduce:animate-none" />}
      {state === "error" && (
        <p className="p-6 text-sm text-muted">
          The diagram viewer couldn&apos;t load from viewer.diagrams.net. Use Download .drawio and open the file in app.diagrams.net.
        </p>
      )}
      <div ref={host} className="overflow-x-auto" />
    </figure>
  );
}
