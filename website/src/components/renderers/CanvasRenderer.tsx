"use client";

import { useRef, useEffect, useState } from "react";

import {
  makeMask,
  paintThroughMask,
  readSurface,
  resolveSurface,
} from "@/lib/ingredient-surface";

interface DrawOp {
  op: string;
  color?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  r?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  width?: number;
  start?: number;
  end?: number;
  content?: string;
  size?: number;
  /** This shape is made OF another medium. See @/lib/ingredient-surface. */
  surface?: { type?: string; payload?: unknown };
}

interface CanvasRendererProps {
  json: string;
}

/**
 * One drawing operation, onto whichever context it is given.
 *
 * Lifted out of the render loop so the same code can draw a shape onto the
 * visible canvas and onto a stencil. Drawing the mask any other way would mean
 * a second description of every shape, and the two would drift.
 */
function drawOp(ctx: CanvasRenderingContext2D, op: DrawOp): void {
  switch (op.op) {
    case "bg":
      // Handled before the loop
      break;
    case "fill":
      ctx.fillStyle = op.color || "#fff";
      break;
    case "stroke":
      ctx.strokeStyle = op.color || "#fff";
      break;
    case "rect":
      ctx.fillRect(op.x || 0, op.y || 0, op.w || 100, op.h || 100);
      break;
    case "circle":
      ctx.beginPath();
      ctx.arc(op.x || 0, op.y || 0, op.r || 50, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "line":
      ctx.beginPath();
      ctx.lineWidth = op.width || 1;
      if (op.color) ctx.strokeStyle = op.color;
      ctx.moveTo(op.x1 || 0, op.y1 || 0);
      ctx.lineTo(op.x2 || 0, op.y2 || 0);
      ctx.stroke();
      break;
    case "arc":
      ctx.beginPath();
      ctx.arc(
        op.x || 0,
        op.y || 0,
        op.r || 50,
        op.start || 0,
        op.end || Math.PI * 2
      );
      ctx.stroke();
      break;
    case "text":
      ctx.font = `${op.size || 16}px monospace`;
      if (op.color) ctx.fillStyle = op.color;
      ctx.textAlign = "center";
      ctx.fillText(op.content || "", op.x || 400, op.y || 400);
      break;
  }
}

export default function CanvasRenderer({ json }: CanvasRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let ops: DrawOp[];
    try {
      ops = JSON.parse(json);
    } catch {
      // Try to salvage truncated JSON by closing the array
      try {
        // Find the last complete object (ends with })
        const lastBrace = json.lastIndexOf("}");
        if (lastBrace > 0) {
          const salvaged = json.substring(0, lastBrace + 1) + "]";
          ops = JSON.parse(salvaged);
        } else {
          setError(true);
          return;
        }
      } catch {
        setError(true);
        return;
      }
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = 800;
    canvas.height = 800;

    // Check if first op sets background, otherwise use default
    const firstOp = ops[0];
    const bgColor = firstOp?.op === "bg" ? (firstOp.color || "#0e0c0a") : "#0e0c0a";
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, 800, 800);

    for (const op of ops) {
      drawOp(ctx, op);
    }

    // ── Ingredients ──────────────────────────────────────────────────────
    // A shape may declare `surface`, making it OUT of another medium rather
    // than filling it with a flat colour. Applied after the flat render
    // rather than instead of it: the ingredient's renderer has to mount and
    // paint before there is anything to sample, and one textured rectangle
    // should not hold back the rest of the drawing.
    let disposed = false;
    void (async () => {
      for (const op of ops) {
        const surface = readSurface(op);
        if (!surface) continue;
        const ingredient = await resolveSurface(surface, 512);
        if (!ingredient || disposed) continue;
        const mask = makeMask(canvas.width, canvas.height);
        if (!mask.ctx) continue;
        // The stencil wants the shape, not its colour.
        mask.ctx.fillStyle = "#fff";
        mask.ctx.strokeStyle = "#fff";
        drawOp(mask.ctx, op);
        paintThroughMask(ctx, mask.canvas, ingredient);
      }
    })();

    return () => {
      disposed = true;
    };
  }, [json]);

  if (error) {
    return (
      <div className="w-full h-full bg-[#0e0c0a] flex items-center justify-center">
        <p className="text-[#4a4540] text-xs">Invalid canvas data</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-[#0e0c0a] flex items-center justify-center">
      <canvas
        ref={canvasRef}
        className="max-w-full max-h-full pointer-events-none"
        style={{ imageRendering: "auto" }}
      />
    </div>
  );
}
