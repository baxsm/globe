"use client";

import { ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type FC, useState } from "react";
import type { AnnotationIndex, NodeAnnotations } from "@/lib/annotations";
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
import { ErrataNote, FindingNote } from "./margin-note";

/**
 * One element of the return, with whatever the margin has to say about it.
 *
 * A leaf renders as a name and a value on one line. A container renders as a disclosure.
 * The two are one component because a GIR nests to eight or nine levels and which of them
 * is a leaf depends on the filing, not on the level.
 *
 * The annotation is a cell in the same grid row as its node, never an absolutely
 * positioned overlay. Alignment is then a layout invariant rather than something
 * re-derived on each scroll and resize, which is how a margin note drifts off the
 * element it describes.
 */
interface DocumentNodeProps {
  readonly element: GirElement;
  readonly depth: number;
  readonly parentPath: string;
  readonly siblings: GirElement["children"];
  readonly annotations: AnnotationIndex;
}

// Two levels shows the jurisdictions without their internals. Fully collapsed hides the
// whole return behind four rows; fully open is several hundred rows with no shape.
const DEFAULT_OPEN_DEPTH = 2;

// Padding on the row, not a nested container: nesting compounds the inset and pushes
// deep nodes off the right edge.
const INDENT_REM = 0.875;

// Declared once because every row has to agree: a row setting its own columns puts the
// margin at a different offset and the column comes apart down the page.
export const NODE_GRID = "grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_18rem]";

const DocumentNode: FC<DocumentNodeProps> = ({
  element,
  depth,
  parentPath,
  siblings,
  annotations,
}) => {
  const children = childElements(element);
  const value = leafValue(element);
  const label = identifyingLabel(element);
  const path = childPath(parentPath, element, siblings);
  const name = localName(element.name);
  const note = annotations.at(path);

  // A branch containing a correction opens regardless of depth. Every errata target in a
  // real GIR sits deeper than the default, so leaving them closed would hide the margin
  // behind disclosures a filer has no reason to open.
  const [open, setOpen] = useState(
    () => depth < DEFAULT_OPEN_DEPTH || annotations.hasAnnotationBelow(path),
  );

  if (children.length === 0) {
    return (
      <div
        className={cn(NODE_GRID, "items-start gap-x-8 border-border/60 border-b")}
        data-path={path}
      >
        {/*
          No hover background: a leaf has nothing to open and nothing to press. Tinting
          it under the cursor promises an action that does not exist, and next to the
          containers, which do respond, it made the whole tree ambiguous about what was
          clickable.
        */}
        <div
          className={cn(
            "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 py-1.5 pr-2",
            note !== null && "bg-ink-applied/[0.035]",
          )}
          style={{ paddingLeft: `${depth * INDENT_REM + 1.5}rem` }}
        >
          <span className="min-w-0 truncate font-mono text-sm text-text-muted">{name}</span>

          {value !== null && (
            <span className="figure min-w-0 truncate text-right text-sm">{value}</span>
          )}
        </div>

        <Margin annotations={annotations} note={note} />
      </div>
    );
  }

  return (
    <div data-path={path}>
      <div className={cn(NODE_GRID, "items-start gap-x-8 border-border/60 border-b")}>
        <button
          aria-expanded={open}
          className={cn(
            "group flex w-full cursor-pointer items-baseline gap-2 py-1.5 pr-2 text-left transition-colors duration-150 hover:bg-sunk",
            note !== null && "bg-ink-applied/[0.035]",
          )}
          onClick={() => setOpen((current) => !current)}
          style={{ paddingLeft: `${depth * INDENT_REM + 0.25}rem` }}
          type="button"
        >
          <ChevronRight
            aria-hidden="true"
            className={cn(
              "size-3.5 shrink-0 translate-y-0.5 text-text-faint transition-[transform,color] duration-200 group-hover:text-text",
              open && "rotate-90",
            )}
            strokeWidth={2}
          />

          <span className="min-w-0 truncate font-mono text-sm">{name}</span>

          {label !== null && (
            <span className="min-w-0 truncate text-sm text-text-muted">{label}</span>
          )}

          {/*
            Sits in the same right-hand lane a leaf puts its value in, so counts and
            values form one column rather than two that alternate down the page.
          */}
          <span className="figure ml-auto shrink-0 text-text-faint text-xs tabular-nums">
            {children.length}
          </span>
        </button>

        <Margin annotations={annotations} note={note} />
      </div>

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
                annotations={annotations}
                depth={depth + 1}
                element={child}
                key={childKey(child, index)}
                parentPath={path}
                siblings={element.children}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/**
 * The margin cell for one row, rendered even when empty so the grid keeps both tracks
 * and the measure holds from row to row. Below `lg` the notes stack under their node
 * rather than disappearing; hiding them would hide the product.
 *
 * The cell stretches its row rather than overflowing it. Pulling it out of flow with
 * `h-0` closes the gap a tall note opens, but the next row's border then cuts the note
 * mid-sentence, and a truncated explanation is worse than a gap.
 */
const Margin: FC<{ note: NodeAnnotations | null; annotations: AnnotationIndex }> = ({
  note,
  annotations,
}) => {
  if (note === null) return <div aria-hidden="true" className="hidden lg:block" />;

  return (
    <div className="animate-note-in space-y-2 py-1.5 pb-3 pl-6 lg:pl-0">
      {note.errata.map((application) => (
        <ErrataNote
          application={application}
          key={`${application.issueNumber}-${application.xpath}-${application.paragraph}`}
          repeated={annotations.repeats(application)}
        />
      ))}

      {note.findings.map((finding) => (
        <FindingNote finding={finding} key={`${finding.rule}-${finding.path}`} />
      ))}
    </div>
  );
};

export default DocumentNode;
