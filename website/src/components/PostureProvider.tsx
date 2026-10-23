"use client";

/**
 * Keeps the visitor's posture (lib/posture.ts) current for the whole site:
 * published on <html> for CSS, and given to components through usePosture().
 * KEEP IN STEP with website/src/components/PostureProvider.tsx and commons/components/PostureProvider.tsx.
 */
import { createContext, useContext, useEffect, useState } from "react";
import { publishPosture, watchPosture, type Posture } from "@/lib/posture";

// Before the browser has measured anything: a flat screen of unknown size,
// which every layout already handles.
const FIRST: Posture = { screen: "compact", fold: "flat", source: "none", segments: [], hinge: null, width: 0, height: 0 };
const Ctx = createContext<Posture>(FIRST);

export function usePosture(): Posture {
  return useContext(Ctx);
}

export default function PostureProvider({ children }: { children: React.ReactNode }) {
  const [posture, setPosture] = useState<Posture>(FIRST);
  useEffect(
    () =>
      watchPosture((p) => {
        publishPosture(p);
        setPosture(p);
      }),
    [],
  );
  return <Ctx.Provider value={posture}>{children}</Ctx.Provider>;
}
