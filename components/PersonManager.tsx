"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Merge, Pencil, Trash2, X } from "lucide-react";
import { mergePeople, removePerson, savePerson } from "@/lib/actions";

type Candidate = { id: number; name: string };

/**
 * Editing, merging and deleting one person.
 *
 * Merge exists because entering the same person twice is the easy mistake, and
 * the alternative — deleting one and re-recording the loans — loses history.
 */
export default function PersonManager({
  id,
  name,
  phone,
  notes,
  candidates,
  canDelete,
  blockedReason,
}: {
  id: number;
  name: string;
  phone: string | null;
  notes: string | null;
  candidates: Candidate[];
  canDelete: boolean;
  blockedReason?: string;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<null | "edit" | "merge" | "delete">(null);
  const [form, setForm] = useState({ name, phone: phone ?? "", notes: notes ?? "" });
  const [mergeInto, setMergeInto] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const close = () => {
    setPanel(null);
    setError(null);
  };

  if (panel === null) {
    return (
      <div className="grid gap-2">
        <button onClick={() => setPanel("edit")} className="btn btn-ghost w-full">
          <Pencil size={16} /> Edit details
        </button>
        {candidates.length > 0 && (
          <button onClick={() => setPanel("merge")} className="btn btn-ghost w-full">
            <Merge size={16} /> Merge into another person
          </button>
        )}
        <button
          onClick={() => setPanel("delete")}
          className="btn btn-danger w-full"
        >
          <Trash2 size={16} /> Delete
        </button>
      </div>
    );
  }

  return (
    <div className="panel px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">
          {panel === "edit" ? "Edit" : panel === "merge" ? "Merge" : "Delete"}
        </h2>
        <button
          onClick={close}
          aria-label="Cancel"
          className="muted grid h-8 w-8 place-items-center rounded-full"
        >
          <X size={16} />
        </button>
      </div>

      {panel === "edit" && (
        <div className="space-y-3">
          <div>
            <label className="label" htmlFor="pm-name">Name</label>
            <input
              id="pm-name"
              className="field"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="pm-phone">Phone</label>
            <input
              id="pm-phone"
              className="field"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="pm-notes">Notes</label>
            <input
              id="pm-notes"
              className="field"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <button
            disabled={pending || !form.name.trim()}
            className="btn btn-primary w-full"
            onClick={() =>
              start(async () => {
                setError(null);
                const r = await savePerson({ id, ...form });
                if (r.ok) {
                  close();
                  router.refresh();
                } else setError(r.error);
              })
            }
          >
            {pending ? <Loader2 size={17} className="animate-spin" /> : "Save"}
          </button>
        </div>
      )}

      {panel === "merge" && (
        <div className="space-y-3">
          <p className="muted text-sm">
            Everything recorded against <strong style={{ color: "var(--ink)" }}>{name}</strong>{" "}
            moves to the person you pick. Balances in the same currency are added
            together. This cannot be undone.
          </p>
          <div>
            <label className="label" htmlFor="pm-merge">Merge into</label>
            <select
              id="pm-merge"
              className="field"
              value={mergeInto}
              onChange={(e) => setMergeInto(Number(e.target.value))}
            >
              <option value="">Choose a person…</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          {error && <p className="neg text-sm" role="alert">{error}</p>}
          <button
            disabled={pending || mergeInto === ""}
            className="btn btn-primary w-full"
            onClick={() =>
              start(async () => {
                setError(null);
                const r = await mergePeople(id, Number(mergeInto));
                if (r.ok) {
                  router.push("/people");
                  router.refresh();
                } else setError(r.error);
              })
            }
          >
            {pending ? <Loader2 size={17} className="animate-spin" /> : "Merge"}
          </button>
        </div>
      )}

      {panel === "delete" && (
        <div className="space-y-3">
          {canDelete ? (
            <>
              <p className="muted text-sm">
                Remove <strong style={{ color: "var(--ink)" }}>{name}</strong>?
                Nothing is recorded against them, so nothing is lost.
              </p>
              {error && <p className="neg text-sm" role="alert">{error}</p>}
              <button
                disabled={pending}
                className="btn btn-primary w-full"
                style={{ background: "var(--red)" }}
                onClick={() =>
                  start(async () => {
                    setError(null);
                    const r = await removePerson(id);
                    if (r.ok) {
                      router.push("/people");
                      router.refresh();
                    } else setError(r.error);
                  })
                }
              >
                {pending ? <Loader2 size={17} className="animate-spin" /> : "Delete"}
              </button>
            </>
          ) : (
            <>
              <p className="muted text-sm">{blockedReason}</p>
              <button
                onClick={() => setPanel("merge")}
                className="btn btn-ghost w-full"
              >
                <Merge size={16} /> Merge them instead
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
