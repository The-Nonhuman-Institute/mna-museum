import Image from "next/image";

type Phase = "I" | "II" | "III" | "IV";

interface WorkFrameProps {
  src?: string;
  alt?: string;
  phase?: Phase;
  workId?: string;
  originatorId?: string;
  size?: "sm" | "md" | "lg";
  placeholder?: boolean;
}

const phaseStyles: Record<Phase, { outer: string; inner: string; mat: string }> = {
  I: {
    outer: "bg-gradient-to-b from-[#3a3530] via-[#2a2520] to-[#1a1510]",
    inner: "bg-gradient-to-b from-[#2a2520] via-[#201c17] to-[#161210]",
    mat: "bg-[#f5f2ed]",
  },
  II: {
    outer: "bg-gradient-to-b from-[#302a25] via-[#201a15] to-[#100a05]",
    inner: "bg-gradient-to-b from-[#201a15] via-[#181210] to-[#0e0a08]",
    mat: "bg-[#d8d0c5]",
  },
  III: {
    outer: "bg-gradient-to-b from-[#252020] via-[#151010] to-[#0a0505]",
    inner: "bg-gradient-to-b from-[#181515] via-[#100c0c] to-[#080505]",
    mat: "bg-[#a09890]",
  },
  IV: {
    outer: "bg-gradient-to-b from-[#1a1818] via-[#0e0c0c] to-[#050404]",
    inner: "bg-gradient-to-b from-[#0e0c0c] via-[#080606] to-[#030202]",
    mat: "bg-[#605850]",
  },
};

const sizeStyles: Record<string, { frame: string; border: string; mat: string }> = {
  sm: { frame: "p-[10px]", border: "p-[3px]", mat: "p-[6px]" },
  md: { frame: "p-[14px]", border: "p-[4px]", mat: "p-[8px]" },
  lg: { frame: "p-[18px]", border: "p-[5px]", mat: "p-[10px]" },
};

export default function WorkFrame({
  src,
  alt = "Work",
  phase = "I",
  workId,
  originatorId,
  size = "md",
  placeholder = false,
}: WorkFrameProps) {
  const ps = phaseStyles[phase];
  const ss = sizeStyles[size];

  return (
    <div className="inline-block">
      {/* Outer frame */}
      <div
        className={`${ps.outer} ${ss.frame} shadow-[4px_6px_20px_rgba(0,0,0,0.5),inset_1px_1px_0_rgba(255,255,255,0.06)]`}
      >
        {/* Frame bevel — light edge */}
        <div
          className={`${ps.inner} ${ss.border} shadow-[inset_2px_2px_4px_rgba(0,0,0,0.4),inset_-1px_-1px_2px_rgba(255,255,255,0.04)]`}
        >
          {/* Mat / liner */}
          <div className={`${ps.mat} ${ss.mat}`}>
            {/* Artwork area */}
            {placeholder || !src ? (
              <div className="aspect-square bg-[#1a1815] flex items-center justify-center min-w-[120px]">
                <div className="text-center">
                  {workId && (
                    <p className="text-[9px] font-sans text-[#4a4540] mb-1">
                      {workId}
                    </p>
                  )}
                  {originatorId && (
                    <p className="text-[9px] font-sans text-[#4a4540]">
                      {originatorId}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="aspect-square relative overflow-hidden">
                <Image
                  src={src}
                  alt={alt}
                  fill
                  className="object-cover"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Placard */}
      {(workId || originatorId) && (
        <div className="mt-3 text-center">
          {workId && (
            <p className="text-[10px] font-sans text-muted">{workId}</p>
          )}
          {originatorId && (
            <p className="text-[10px] text-muted">{originatorId}</p>
          )}
          <p className="text-[9px] text-muted/60 uppercase tracking-wider mt-0.5">
            Phase {phase}
          </p>
        </div>
      )}
    </div>
  );
}
