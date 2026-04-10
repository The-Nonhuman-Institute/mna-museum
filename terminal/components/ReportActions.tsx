"use client";

export default function ReportActions() {
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
        display: "flex",
        justifyContent: "center",
        gap: 16,
      }}
    >
      <button
        onClick={() => window.print()}
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
        Save as PDF
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
