"use client";

/**
 * Report page action bar. Two buttons:
 *   - Share: uses the native Web Share API on iOS, which opens the
 *     full share sheet (Save to Files, AirDrop, Mail, Messages, Print,
 *     etc.). Falls back to window.print() on browsers without share.
 *   - Back: returns to the previous page.
 *
 * Hidden in print output via the "no-print" class.
 */
export default function ReportActions() {
  async function handleShare() {
    if (navigator.share) {
      try {
        await navigator.share({
          title: document.title,
          url: window.location.href,
        });
      } catch {
        // User cancelled the share sheet — not an error
      }
    } else {
      window.print();
    }
  }

  return (
    <div
      className="no-print"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        background: "#0e0c0a",
        borderTop: "1px solid #2a2520",
        padding: "12px 24px",
        paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
        display: "flex",
        justifyContent: "center",
        gap: 16,
        zIndex: 50,
      }}
    >
      <button
        onClick={handleShare}
        style={{
          fontSize: 11,
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          padding: "8px 20px",
          background: "#e8e0d2",
          color: "#0e0c0a",
          border: "none",
          cursor: "pointer",
          fontFamily: "Georgia, serif",
        }}
      >
        Share / Save PDF
      </button>
      <button
        onClick={() => history.back()}
        style={{
          fontSize: 11,
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          padding: "8px 20px",
          background: "transparent",
          color: "#8a8680",
          border: "1px solid #2a2520",
          cursor: "pointer",
          fontFamily: "Georgia, serif",
        }}
      >
        Back
      </button>
    </div>
  );
}
