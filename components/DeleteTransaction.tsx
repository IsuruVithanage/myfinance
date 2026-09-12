"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { removeTransaction } from "@/lib/actions";

export default function DeleteTransaction({ id }: { id: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="btn btn-ghost w-full"
        style={{ color: "var(--red)" }}
      >
        <Trash2 size={16} /> Delete
      </button>
    );
  }

  return (
    <div className="panel px-4 py-4 text-center">
      <p className="text-sm font-semibold">Delete this transaction?</p>
      <p className="muted mt-1 text-xs">
        Every account it touched goes back to what it was before.
      </p>
      <div className="mt-3 flex gap-2">
        <button onClick={() => setConfirming(false)} className="btn btn-ghost flex-1">
          Keep it
        </button>
        <button
          disabled={pending}
          className="btn btn-primary flex-1"
          style={{ background: "var(--red)" }}
          onClick={() =>
            start(async () => {
              await removeTransaction(id);
              router.push("/transactions");
              router.refresh();
            })
          }
        >
          {pending ? <Loader2 size={16} className="animate-spin" /> : "Delete"}
        </button>
      </div>
    </div>
  );
}
