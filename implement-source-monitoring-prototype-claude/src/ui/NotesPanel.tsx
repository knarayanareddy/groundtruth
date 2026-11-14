import { useState } from "react";
import type { ReviewerNote } from "../engine/types";
import { LIMITS } from "../engine/constants";
import { visibleNotes } from "../engine/record";
import { Badge, btn, field } from "./shared";

export function NotesPanel({
  notes, T, alias, showAll, onAlias, onAdd, onShowAll,
}: {
  notes: ReviewerNote[];
  T: number;
  alias: string;
  showAll: boolean;
  onAlias: (v: string) => void;
  onAdd: (text: string) => void;
  onShowAll: (v: boolean) => void;
}) {
  const [text, setText] = useState("");
  const shown = visibleNotes(notes, T, showAll);
  return (
    <div className="space-y-3">
      <p className="rounded border border-slate-300 bg-slate-50 p-2 text-sm text-slate-800">
        Notes are a <strong>separate, non-causal layer</strong> typed by you on this device. They never influence status. During ordinary replay only notes authored at or before the current T are shown. Notes are included in exports, which are not anonymised, encrypted or signed — do not type sensitive information.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm font-semibold">
          Local alias (unauthenticated, not an identity)
          <input className={`${field} ml-1 w-40`} value={alias} onChange={(e) => onAlias(e.target.value)} maxLength={40} data-testid="note-alias" />
        </label>
      </div>
      <div>
        <label className="block text-sm font-semibold" htmlFor="note-text">Reviewer note (plain text, max {LIMITS.maxNoteLen} characters)</label>
        <textarea id="note-text" className={`${field} mt-1 w-full`} rows={3} maxLength={LIMITS.maxNoteLen} value={text} onChange={(e) => setText(e.target.value)} data-testid="note-text" />
        <button type="button" className={`${btn} mt-1`} disabled={text.trim().length === 0} onClick={() => { onAdd(text); setText(""); }} data-testid="btn-add-note">
          Add note at T={T} s
        </button>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={showAll} onChange={(e) => onShowAll(e.target.checked)} data-testid="show-all-notes" />
        Show all notes, including those authored at later replay times (non-causal review layer)
      </label>
      <ul className="space-y-2" data-testid="notes-list" aria-label="Reviewer notes">
        {shown.length === 0 ? <li className="text-sm text-slate-700">No notes visible at T = {T} s.</li> : null}
        {shown.map((n) => (
          <li key={n.id} className="rounded border border-slate-300 p-2 text-sm" data-testid={`note-${n.id}`}>
            <div className="text-xs text-slate-700">
              <code>{n.id}</code> · authored at T={n.authoredAtT} s · alias “{n.alias}” <Badge>local, unauthenticated</Badge> {n.authoredAtT > T ? <Badge tone="amber">LATER THAN CURRENT T</Badge> : null}
            </div>
            <div className="whitespace-pre-wrap" data-testid="note-body">{n.text}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
