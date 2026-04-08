import Image from "next/image";

interface LoginPageProps {
  searchParams: Promise<{ next?: string; error?: string }>;
}

/**
 * Steward login page. Single password field. On submit, POSTs to
 * /api/login which verifies the bcrypt hash, sets the session cookie,
 * and redirects back to the `next` path (or /feed).
 *
 * Intentionally plain — no logo animation, no tagline, no marketing.
 * This is the operator's entry gate, not a product landing page.
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next = "/feed", error } = await searchParams;

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-[320px]">
        {/* Identity mark — fractured circle, small and quiet */}
        <div className="flex justify-center mb-10">
          <Image
            src="/icon.svg"
            alt="Museum of Nonhuman Art"
            width={48}
            height={48}
            className="opacity-60"
            priority
          />
        </div>

        {/* Title */}
        <div className="text-center mb-8">
          <p className="label mb-2">Museum of Nonhuman Art</p>
          <h1 className="display text-2xl">Steward Terminal</h1>
        </div>

        {/* Login form */}
        <form action="/api/login" method="post" className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <div>
            <label htmlFor="password" className="label block mb-2">
              Steward Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              autoFocus
              className="w-full bg-surface border border-border px-4 py-3 text-foreground font-mono text-sm focus:outline-none focus:border-muted transition-colors"
            />
          </div>

          {error ? (
            <p className="text-xxs text-error uppercase tracking-widest text-center">
              {error === "invalid"
                ? "Password incorrect"
                : "Authentication failed"}
            </p>
          ) : null}

          <button
            type="submit"
            className="w-full bg-foreground text-background py-3 text-xxs uppercase tracking-widest hover:bg-muted transition-colors"
          >
            Enter Terminal
          </button>
        </form>

        {/* Footer */}
        <p className="label text-center mt-12">
          Private institutional tool
        </p>
      </div>
    </main>
  );
}
