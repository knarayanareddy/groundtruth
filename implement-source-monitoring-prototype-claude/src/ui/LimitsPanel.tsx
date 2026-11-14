import { LIMITATIONS } from "../engine/limits";

export function LimitsPanel() {
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm text-slate-900" data-testid="limitations">
      {LIMITATIONS.map((l) => (<li key={l}>{l}</li>))}
    </ul>
  );
}
