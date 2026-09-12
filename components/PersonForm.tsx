"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { savePerson } from "@/lib/actions";

export default function PersonForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-4">
      <div className="panel space-y-3 px-4 py-4">
        <div>
          <label className="label" htmlFor="p-name">Name</label>
          <input
            id="p-name"
            className="field"
            placeholder="Kamal"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="p-phone">Phone (optional)</label>
          <input
            id="p-phone"
            className="field"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="p-notes">Notes (optional)</label>
          <input
            id="p-notes"
            className="field"
            placeholder="Office, cricket club…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{
            background: "color-mix(in srgb, var(--red) 12%, transparent)",
            color: "var(--red)",
          }}
          role="alert"
        >
          {error}
        </p>
      )}

      <button
        disabled={pending || !name.trim()}
        className="btn btn-primary w-full"
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await savePerson({ name, phone, notes });
            if (r.ok) {
              router.push("/people");
              router.refresh();
            } else setError(r.error);
          })
        }
      >
        {pending ? <Loader2 size={18} className="animate-spin" /> : "Add person"}
      </button>

      <p className="muted text-center text-xs">
        Their running balance is created the first time you lend or borrow —
        one per currency, so LKR and USD never mix.
      </p>
    </div>
  );
}
