"use client";

import dynamic from "next/dynamic";
import { Component, type ReactNode } from "react";
import { useReducedMotion, useWebGL } from "@/components/court/court-scene";
import { Goal2D } from "./goal-2d";
import type { GoalData } from "./zones";

const Goal3D = dynamic(() => import("./goal-3d"), { ssr: false, loading: () => <div className="court-shimmer h-full w-full rounded-xl" /> });

/** The goal heatmap in 3D, or flat where WebGL isn't available. `live` false shows the flat goal (chat: too many canvases). */
export function GoalView({ data, height = 340, live = true }: { data: GoalData; height?: number; live?: boolean }) {
  const gl = useWebGL();
  const still = useReducedMotion();
  if (gl === false || !live) return <Goal2D data={data} />;
  return (
    <div className="w-full" style={{ maxHeight: height, aspectRatio: "4 / 3" }}>
      {gl && (
        <Fallback flat={<Goal2D data={data} />}>
          <Goal3D data={data} still={still} />
        </Fallback>
      )}
    </div>
  );
}

/** WebGL can still fail after the check (lost context, blocked GPU): show the flat goal then. */
class Fallback extends Component<{ flat: ReactNode; children: ReactNode }, { broken: boolean }> {
  state = { broken: false };
  static getDerivedStateFromError() {
    return { broken: true };
  }
  render() {
    return this.state.broken ? this.props.flat : this.props.children;
  }
}
