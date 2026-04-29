/**
 * Shared style tokens for institutional email templates.
 *
 * Email clients require inline styles and don't support CSS variables, so
 * each component imports the tokens it needs and applies them via the
 * `style` prop. Keep this list small — adding tokens here means every
 * template inherits them on the next build.
 */

export const colors = {
  /* Paper / off-white background, matches the warm-paper used across
     the site. Email clients tend to wash colors out a touch, so the
     hex is slightly warmer than warm-paper to compensate. */
  paper: "#F1ECE2",
  ink: "#0A0A0A",
  inkSoft: "#1a1a1a",
  muted: "#666666",
  mutedSoft: "#999999",
  border: "#d4d4d4",
  borderSoft: "#e8e3d8",
  /* Verdict palette aligned with the site's site-level palette. */
  canonGreen: "#2d6a3a",
  rejectRed: "#a83232",
  reviewAmber: "#b87314",
} as const;

export const fonts = {
  /* Georgia is the safest serif across email clients. We mirror the
     Cormorant-style display use by toning Georgia at large sizes. */
  display: "Georgia, 'Times New Roman', serif",
  body: "Georgia, 'Times New Roman', serif",
  /* Helvetica + Arial fallback for sans labels (the tracked-out
     uppercase eyebrows). Some clients squash arial unless we name
     Helvetica first. */
  sans: "Helvetica Neue, Helvetica, Arial, sans-serif",
} as const;

export const sizes = {
  /* Container width used for the notice-style emails. 600 is the
     traditional safe width across email clients. */
  noticeWidth: "600px",
  /* Document-style emails (Bulletin) use a wider container so the
     multi-column grids breathe. Outlook on desktop still renders
     fine at 720, but anything wider risks horizontal scroll. */
  documentWidth: "720px",
} as const;

/* ─── Reusable text style presets ───────────────────────────────────────── */

export const textStyles = {
  /* Tracked-out uppercase eyebrow — used above section titles and
     inside the field-label cells. Email clients vary on how they
     render letter-spacing on small fonts; 0.22em is a safe ceiling. */
  eyebrow: {
    fontFamily: fonts.sans,
    fontSize: "10px",
    letterSpacing: "0.22em",
    textTransform: "uppercase" as const,
    color: colors.muted,
    margin: 0,
    fontWeight: 500,
  },
  /* Smaller eyebrow for nested label cells in metadata grids. */
  fieldLabel: {
    fontFamily: fonts.sans,
    fontSize: "9.5px",
    letterSpacing: "0.18em",
    textTransform: "uppercase" as const,
    color: colors.muted,
    margin: 0,
    fontWeight: 500,
  },
  /* Display serif used for the big notice title (NOTICE OF ACCESSION,
     INSTITUTIONAL BULLETIN, etc.). The mocks render this in a Cormorant-
     style cut; Georgia at 36pt with light tracking approximates it
     well across mail clients. */
  displayTitle: {
    fontFamily: fonts.display,
    fontSize: "32px",
    lineHeight: "1.1",
    letterSpacing: "0.005em",
    color: colors.ink,
    fontWeight: 400,
    margin: 0,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: "14px",
    lineHeight: "1.6",
    color: colors.inkSoft,
    margin: 0,
  },
  fieldValue: {
    fontFamily: fonts.body,
    fontSize: "13px",
    color: colors.ink,
    margin: 0,
  },
  /* Italic motto used at the bottom of every notice. The mocks place
     it just above the dark footer. */
  motto: {
    fontFamily: fonts.display,
    fontSize: "13px",
    fontStyle: "italic" as const,
    color: colors.ink,
    margin: 0,
    lineHeight: "1.55",
  },
} as const;
