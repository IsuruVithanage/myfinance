"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";

/**
 * Most failures here are the database being briefly unreachable (Neon's free
 * tier sleeps). Retrying is nearly always the right move, so that's the
 * primary action — and no balance is ever shown from a failed read.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app]", error);
  }, [error]);

  return (
    <div className="grid min-h-[70dvh] place-items-center px-4 text-center">
      <div>
        <h1 className="title">Something went wrong</h1>
        <p className="muted mx-auto mt-2 max-w-xs text-sm">
          Your data is safe — this screen just couldn&apos;t load. It is usually
          the database waking up.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <button onClick={reset} className="btn btn-primary">
            <RefreshCw size={16} /> Try again
          </button>
          <Link href="/" className="btn btn-ghost">
            Back to home
          </Link>
        </div>
        {error.digest && (
          <p className="faint mt-4 text-[0.7rem]">Reference {error.digest}</p>
        )}
      </div>
    </div>
  );
}
