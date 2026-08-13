import type { FC, ReactNode } from "react";
import { cn } from "@/lib/utils";

// A page and its header must read the same measure, or the two sit at different widths
// and the page shifts sideways when the tab changes.
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
