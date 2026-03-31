"use client";

import { useRef, useEffect } from "react";

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
}

interface CanvasRendererProps {
  json: string;
}

export default function CanvasRenderer({ json }: CanvasRendererProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  let ops: DrawOp[];
  try {
    ops = JSON.parse(json);
  } catch {
    return (
      <div className="w-full h-full bg-[#0e0c0a] flex items-center justify-center">
        <p className="text-[#4a4540] text-xs">Invalid canvas data</p>
      </div>
    );
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = 800;
    canvas.height = 800;
    ctx.fillStyle = "#0e0c0a";
    ctx.fillRect(0, 0, 800, 800);

    for (const op of ops) {
      switch (op.op) {
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
  }, [ops]);

  return (
    <div className="w-full h-full bg-[#0e0c0a] flex items-center justify-center">
      <canvas
        ref={canvasRef}
        className="max-w-full max-h-full"
        style={{ imageRendering: "auto" }}
      />
    </div>
  );
}
