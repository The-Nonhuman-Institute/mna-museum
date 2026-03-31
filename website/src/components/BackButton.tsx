"use client";

import { useRouter } from "next/navigation";

export default function BackButton() {
  const router = useRouter();

  return (
    <button
      onClick={() => router.back()}
      className="text-[12px] text-muted hover:text-foreground transition-colors flex items-center gap-2"
    >
      <span className="text-[14px]">←</span>
      Back
    </button>
  );
}
