"use client";

import { ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type FC, useState } from "react";
import type { GirElement } from "@/lib/document";
import {
  childElements,
  childKey,
  childPath,
  identifyingLabel,
  leafValue,
  localName,
} from "@/lib/document";
import { cn } from "@/lib/utils";

/**
 * One element of the return.
 *
 * A leaf renders as a name and a value on one line. A container renders as a
 * disclosure. The two are one component because a GIR nests to eight or nine levels and
 * which of them is a leaf depends on the filing, not on the level.
 */
interface DocumentNodeProps {
  readonly element: GirElement;
  readonly depth: number;
  readonly parentPath: string;
}

/**
 * The top two levels start open.
 *
 * A document that opens fully collapsed shows a filer four rows and hides their entire
 * return. Opening everything is the other failure: several hundred rows with no shape.
 * Two levels shows the jurisdictions without their internals.
 */
const DEFAULT_OPEN_DEPTH = 2;

/**
 * Indentation is padding on the row, not a nested container.
 *
 * Nesting a padded div per level compounds the inset and pushes deep nodes off the
 * right edge. A single computed inset keeps every row full width and its hover target
 * whole.
 */
const INDENT_REM = 0.875;

const DocumentNode: FC<DocumentNodeProps> = ({ element, depth, parentPath }) => {
  const [open, setOpen] = useState(depth < DEFAULT_OPEN_DEPTH);

  const children = childElements(element);
  const value = leafValue(element);
  const label = identifyingLabel(element);
  const path = childPath(parentPath, element);
  const name = localName(element.name);

  if (children.length === 0) {
    return (
      <div
        className="group grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 border-border/60 border-b py-1.5 pr-2 transition-colors duration-150 hover:bg-sunk/40"
        data-path={path}
        style={{ paddingLeft: `${depth * INDENT_REM + 1.5}rem` }}
      >
        <span className="min-w-0 truncate font-mono text-sm text-text-muted">{name}</span>

        {value !== null && (
          <span className="figure min-w-0 truncate text-right text-sm">{value}</span>
        )}
      </div>
    );
  }

  return (
    <div data-path={path}>
      <button
        aria-expanded={open}
        className="flex w-full cursor-pointer items-baseline gap-2 border-border/60 border-b py-1.5 pr-2 text-left transition-colors duration-150 hover:bg-sunk/40"
        onClick={() => setOpen((current) => !current)}
        style={{ paddingLeft: `${depth * INDENT_REM + 0.25}rem` }}
        type="button"
      >
        <ChevronRight
          aria-hidden="true"
          className={cn(
            "size-3.5 shrink-0 translate-y-0.5 text-text-faint transition-transform",
            open && "rotate-90",
          )}
          strokeWidth={2}
        />

        <span className="min-w-0 truncate font-mono text-sm">{name}</span>

        {label !== null && (
          <span className="min-w-0 truncate text-sm text-text-muted">{label}</span>
        )}

        {/*
          Sits in the same right-hand lane a leaf puts its value in, so counts and values
          form one column rather than two that alternate down the page.
        */}
        <span className="figure ml-auto shrink-0 text-text-faint text-xs tabular-nums">
          {children.length}
        </span>
      </button>

      {/*
        The disclosure animates its own height so the rows below move rather than jump.
        `AnimatePresence` keeps the subtree mounted for the closing pass; without it a
        collapse removes the children on the same frame and only the open direction
        appears animated.
      */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            animate={{ height: "auto", opacity: 1 }}
            className="overflow-hidden"
            exit={{ height: 0, opacity: 0 }}
            initial={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            {children.map((child, index) => (
              <DocumentNode
                depth={depth + 1}
                element={child}
                key={childKey(child, index)}
                parentPath={path}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DocumentNode;
