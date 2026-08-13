import { useSyncExternalStore } from "react";

/**
 * The palette's open state, held outside React.
 *
 * The trigger sits in the topbar and the dialog is a sibling of the whole shell, so a
 * context provider spanning both would re-render every page on each keystroke against
 * the palette. An external store keeps the subscription to the two components that
 * actually care.
 */
let open = false;
const listeners = new Set<() => void>();

const emit = () => {
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const setPaletteOpen = (next: boolean) => {
  if (open === next) return;
  open = next;
  emit();
};

export const togglePalette = () => setPaletteOpen(!open);

/** The server has no palette open, so the server snapshot is a constant `false`. */
export const usePaletteOpen = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => open,
    () => false,
  );
