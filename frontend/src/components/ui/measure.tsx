import type { FC, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * One page width, everywhere.
 *
 * Every route shares this shell so the content does not jump sideways when the rail
 * takes you between them. An earlier version offered a second, narrower measure for
 * reading pages; that fixed a header sitting at one width above a body at another, and
 * replaced it with the reference page snapping 384px narrower than every other route.
 *
 * Long-form text still wants a shorter line than 1152px. It gets one from `max-w-prose`
 * on the paragraph itself, which narrows the text without moving the page around it.
 */
const MEASURE = "max-w-6xl";

interface MeasureProps {
  readonly children: ReactNode;
  readonly className?: string;
}

const Measure: FC<MeasureProps> = ({ children, className }) => (
  <div className={cn("mx-auto w-full px-4 sm:px-8", MEASURE, className)}>{children}</div>
);

export default Measure;
