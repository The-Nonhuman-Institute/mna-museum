"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import CompositeRenderer from "@/components/renderers/CompositeRenderer";
import { generateShareFiles, predictShareKind } from "@/lib/share-engine";
import type { Work } from "@/lib/collection";

/**
 * A bench for proving a medium works.
 *
 * MNA-OPS-001 §V E2/E3. `system/scripts/render-matrix.ts` drives this page with
 * one fixture per medium and asks two questions: did anything get painted, and
 * does the share produce the file it promised. Both were unanswerable before —
 * a medium could only be exercised by an Originator making a work in it, so
 * three media opened in August went untested until a real work arrived and
 * broke.
 *
 * Deliberately inert. It renders what it is handed and records nothing: no
 * database, no events, nothing submitted, nothing shown to a visitor. It is not
 * in navigation and holds no institutional content.
 */

declare global {
  interface Window {
    __mnaRender?: (type: string, payload: string) => void;
    __mnaShare?: (
      type: string,
      payload: string,
    ) => Promise<{ kind: string; name: string; type: string; size: number; head: string } | null>;
  }
}

/** A Work-shaped object for the share engine. Never persisted. */
function fixtureWork(type: string, payload: string): Work {
  return {
    id: "MNA-FIXTURE-0000",
    originator_id: "MNA-FIXTURE",
    output_type: type,
    medium: type,
    output_payload: payload,
    title: null,
    phase_at_submission: "I",
    submission_date: "2026-01-01",
    created_at: "2026-01-01",
  } as unknown as Work;
}

export default function Harness() {
  const [spec, setSpec] = useState<{ type: string; payload: string } | null>(null);
  const nonce = useRef(0);

  const render = useCallback((type: string, payload: string) => {
    nonce.current += 1;
    setSpec({ type, payload });
  }, []);

  useEffect(() => {
    window.__mnaRender = render;
    window.__mnaShare = async (type, payload) => {
      const work = fixtureWork(type, payload);
      const result = await generateShareFiles(work);
      if (!result) return null;
      const file = result.type === "audio" ? result.audioFile : result.file;
      const buf = new Uint8Array(await file.arrayBuffer());
      let head = "";
      for (let i = 0; i < Math.min(16, buf.length); i++) head += buf[i].toString(16).padStart(2, "0");
      return {
        // What generateShareFiles actually produced, next to what
        // predictShareKind promised — a mismatch is itself a defect.
        kind: result.type === "audio" ? "audio" : result.type === "video" ? "video" : "image",
        promised: predictShareKind(work),
        name: file.name,
        type: file.type,
        size: file.size,
        head,
      } as never;
    };
    return () => {
      delete window.__mnaRender;
      delete window.__mnaShare;
    };
  }, [render]);

  return (
    <div style={{ background: "#0A0A0A", minHeight: "100vh", padding: 0, margin: 0 }}>
      <div
        id="harness-target"
        key={nonce.current}
        style={{ width: 800, height: 800, background: "#0A0A0A", position: "relative", overflow: "hidden" }}
      >
        {spec && (
          <CompositeRenderer
            json={JSON.stringify({
              layout: "stack",
              background: "#0A0A0A",
              parts: [{ type: spec.type, payload: spec.payload }],
            })}
          />
        )}
      </div>
    </div>
  );
}
