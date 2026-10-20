"use client";

import { useCallback, useEffect, useId, useState, useSyncExternalStore, type RefObject } from "react";

// Browsers allow only a handful of WebGL contexts per page. Chat blocks draw in 3D only while on screen, and at most
// MAX_LIVE at once: the ones that came into view (or were clicked) last. The rest show their flat picture.

const MAX_LIVE = 2;
let order: string[] = [];
const subs = new Set<() => void>();
const set = (next: string[]) => ((order = next), subs.forEach((f) => f()));
const subscribe = (f: () => void) => (subs.add(f), () => void subs.delete(f));

export function useLiveSlot(visible: boolean): [live: boolean, promote: () => void] {
  const id = useId();
  useEffect(() => {
    if (!visible) return;
    set([...order.filter((x) => x !== id), id]);
    return () => set(order.filter((x) => x !== id));
  }, [visible, id]);
  const live = useSyncExternalStore(subscribe, () => order.slice(-MAX_LIVE).includes(id), () => false);
  const promote = useCallback(() => set([...order.filter((x) => x !== id), id]), [id]);
  return [live, promote];
}

export function useInView(ref: RefObject<HTMLElement | null>, margin = "0px"): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setSeen(e.isIntersecting), { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, margin]);
  return seen;
}
