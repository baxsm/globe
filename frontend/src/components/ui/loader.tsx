import type { FC } from "react";
import { cn } from "@/lib/utils";

/**
 * The in-progress mark for a button that is waiting on the network.
 *
 * A ring rather than a spinning icon glyph: it inherits `currentColor`, so the same
 * element reads correctly on the dark primary button and on a light secondary one
 * without a second variant. Under `prefers-reduced-motion` the global rule in
 * `globals.css` stops the rotation and it stays a static ring, which still reads as a
 * distinct state because the label beside it also changes.
 */
const Loader: FC<{ className?: string }> = ({ className }) => (
  <span
    aria-hidden="true"
    className={cn(
      "size-4 animate-spin rounded-full border-2 border-current border-t-transparent",
      className,
    )}
  />
);

export default Loader;
