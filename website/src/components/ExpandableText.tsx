"use client";

import { useState } from "react";

interface ExpandableTextProps {
  text: string;
  previewLength?: number;
  className?: string;
}

export default function ExpandableText({
  text,
  previewLength = 300,
  className = "",
}: ExpandableTextProps) {
  const [expanded, setExpanded] = useState(false);
  const needsTruncation = text.length > previewLength;
  const displayText = expanded || !needsTruncation
    ? text
    : text.substring(0, previewLength).replace(/\s+\S*$/, "") + "...";

  return (
    <div className={className}>
      <p className="text-[13px] text-muted leading-relaxed">
        {displayText}
      </p>
      {needsTruncation && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[11px] text-muted/70 hover:text-foreground transition-colors mt-2 uppercase tracking-wider"
        >
          {expanded ? "Collapse" : "Read full rationale"}
        </button>
      )}
    </div>
  );
}
