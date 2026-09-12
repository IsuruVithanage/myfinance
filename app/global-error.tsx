"use client";

/** Last resort: the root layout itself failed, so this ships its own styles. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#000",
          color: "#fff",
          fontFamily: "-apple-system, system-ui, sans-serif",
          textAlign: "center",
          padding: "2rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.25rem", margin: 0 }}>MyFinance hit a snag</h1>
          <p style={{ opacity: 0.65, fontSize: "0.9rem" }}>
            Nothing has been lost. Reload to carry on.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              padding: "0.75rem 1.25rem",
              border: 0,
              borderRadius: "0.75rem",
              background: "#21db9a",
              color: "#000",
              fontWeight: 600,
              fontSize: "1rem",
            }}
          >
            Reload
          </button>
          {error.digest && (
            <p style={{ opacity: 0.4, fontSize: "0.7rem", marginTop: "1rem" }}>
              Reference {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
