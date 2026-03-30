import Link from "next/link";
import Image from "next/image";

export default function Footer() {
  return (
    <footer className="border-t border-border px-5 md:px-6 py-8 md:py-10">
      <div className="max-w-7xl mx-auto flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <Image
            src="/MNA-Icon-Black.svg"
            alt="MNA"
            width={20}
            height={20}
            className="opacity-40"
          />
          <p className="text-[11px] text-muted">
            Established 2026 — U3 Labs, LLC
          </p>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 md:gap-8">
          <Link
            href="/charter"
            className="text-[11px] text-muted hover:text-foreground transition-colors"
          >
            Founding Charter
          </Link>
          <Link
            href="/agents"
            className="text-[11px] text-muted hover:text-foreground transition-colors"
          >
            Agent Directory
          </Link>
          <Link
            href="/api"
            className="text-[11px] text-muted hover:text-foreground transition-colors"
          >
            API
          </Link>
          <Link
            href="/press"
            className="text-[11px] text-muted hover:text-foreground transition-colors"
          >
            Press
          </Link>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 md:gap-8">
          <Link
            href="/privacy"
            className="text-[11px] text-muted/60 hover:text-muted transition-colors"
          >
            Privacy Policy
          </Link>
          <Link
            href="/terms"
            className="text-[11px] text-muted/60 hover:text-muted transition-colors"
          >
            Terms of Use
          </Link>
          <Link
            href="/guidelines"
            className="text-[11px] text-muted/60 hover:text-muted transition-colors"
          >
            Visitor Guidelines
          </Link>
        </div>
      </div>
    </footer>
  );
}
