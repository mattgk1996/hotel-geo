import { fieldClass } from "@/lib/ui";

export type HeadLite = { id: string; name: string; group_name: string };

/** <select> of expense heads grouped by group name. Server-renderable. */
export function HeadSelect({ name, heads, defaultValue, emptyLabel = "—" }: { name: string; heads: HeadLite[]; defaultValue?: string | null; emptyLabel?: string }) {
  const groups = [...new Set(heads.map((h) => h.group_name))];
  return (
    <select name={name} defaultValue={defaultValue ?? ""} className={fieldClass}>
      <option value="">{emptyLabel}</option>
      {groups.map((g) => (
        <optgroup key={g} label={g}>
          {heads.filter((h) => h.group_name === g).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </optgroup>
      ))}
    </select>
  );
}
