import type { FC, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The two page measures, named once.
 *
 * Every route was setting its own `max-w-*`, and the return header had drifted a step
 * narrower than the body beneath it. The visible result was the title and tabs sitting
 * at one width and the document at another, and the whole page shifting sideways on
 * every navigation between Document, XML and Versions.
 *
 * `document` is for the surfaces carrying the two-column document and margin. `prose` is
 * for the reading surfaces, narrow enough to keep a line of text at a comfortable
 * measure. A route picks one and its header picks the same one, because they are the
 * same page.
 */
const MEASURE = {
  document: "max-w-6xl",
  prose: "max-w-3xl",
} as const;

export type MeasureName = keyof typeof MEASURE;

interface MeasureProps {
  readonly children: ReactNode;
  readonly as?: MeasureName;
  readonly className?: string;
}

const Measure: FC<MeasureProps> = ({ children, as = "document", className }) => (
  <div className={cn("mx-auto w-full px-4 sm:px-8", MEASURE[as], className)}>{children}</div>
);

export default Measure;
