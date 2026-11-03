/** Trello's label color palette (6 columns of light/base/dark-ish variants). */
export const LABEL_PALETTE: string[] = [
  "#baf3db", "#f8e6a0", "#fedec8", "#ffd5d2", "#dfd8fd",
  "#4bce97", "#f5cd47", "#fea362", "#f87168", "#9f8fef",
  "#1f845a", "#946f00", "#c25100", "#c9372c", "#6e5dc6",
  "#cce0ff", "#c6edfb", "#baf3db", "#fdd0ec", "#dcdfe4",
  "#579dff", "#6cc3e0", "#4bce97", "#e774bb", "#8590a2",
  "#0c66e4", "#227d9b", "#1f845a", "#ae4787", "#626f86",
];

export const DEFAULT_LABEL_COLOR = LABEL_PALETTE[5];

export type TaskLabel = { id: string; board_id: string; name: string; color: string; position: number };
