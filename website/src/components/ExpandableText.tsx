"use client";

import { useState } from "react";

interface ExpandableTextProps {
  text: string;
  previewLength?: number;
  className?: string;
}

/** Convert basic markdown (bold, italic, headings) to React nodes */
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip empty lines
    if (!line.trim()) {
      if (i > 0 && lines[i - 1]?.trim()) {
        elements.push(<br key={`br-${i}`} />);
      }
      continue;
    }

    // Headings
    if (line.startsWith("## ")) {
      elements.push(
        <strong key={i} className="block mt-4 mb-1 text-foreground text-[14px]">
          {line.slice(3)}
        </strong>
      );
      continue;
    }
    if (line.startsWith("# ")) {
      elements.push(
        <strong key={i} className="block mt-4 mb-1 text-foreground text-[14px]">
          {line.slice(2)}
        </strong>
      );
      continue;
    }

    // Inline formatting: **bold** and *italic*
    const parts: React.ReactNode[] = [];
    let remaining = line;
    let keyIdx = 0;

    while (remaining.length > 0) {
      // Bold: **text**
      const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);
      if (boldMatch && boldMatch.index !== undefined) {
        if (boldMatch.index > 0) {
          parts.push(remaining.substring(0, boldMatch.index));
        }
        parts.push(
          <strong key={`b-${i}-${keyIdx++}`} className="text-foreground font-semibold">
            {boldMatch[1]}
          </strong>
        );
        remaining = remaining.substring(boldMatch.index + boldMatch[0].length);
        continue;
      }

      // No more formatting — push rest
      parts.push(remaining);
      break;
    }

    elements.push(
      <span key={i}>
        {parts}
        {i < lines.length - 1 && lines[i + 1]?.trim() ? " " : ""}
      </span>
    );
  }

  return elements;
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
      <div className="text-[13px] text-muted leading-relaxed">
        {renderMarkdown(displayText)}
      </div>
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
