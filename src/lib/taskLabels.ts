/** Trello-style preset label colors — stored as the color key itself in
 * tasks.labels (text[]), e.g. ["green", "red"]. No custom per-label names
 * yet, matching the "Edit labels" card-menu entry's current scope. */
export const LABEL_COLORS: { key: string; name: string; className: string }[] = [
  { key: "green", name: "Green", className: "bg-emerald-500" },
  { key: "yellow", name: "Yellow", className: "bg-yellow-400" },
  { key: "orange", name: "Orange", className: "bg-orange-500" },
  { key: "red", name: "Red", className: "bg-red-500" },
  { key: "purple", name: "Purple", className: "bg-purple-500" },
  { key: "blue", name: "Blue", className: "bg-blue-500" },
];

export const labelClassName = (key: string): string =>
  LABEL_COLORS.find((c) => c.key === key)?.className || "bg-slate-400";
