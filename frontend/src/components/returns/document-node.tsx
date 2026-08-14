"use client";

import { ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type CSSProperties, type FC, useState } from "react";
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
export const NODE_GRID = "grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_20rem]";

/**
 * A row carries no rule of its own.
 *
 * Several hundred rows each drawing a full-width border turns a document into a
 * spreadsheet, and against that many lines nothing else on the page can register as
 * structure. Hierarchy comes from the indent guide, which is what a horizontal rule
 * never provided.
 */
const ROW = "items-start gap-x-6";

/**
 * The gap between an element's name and its value, closed by a leader.
 *
 * Measured before this existed: on `Basis / GIR1909` the name ended at x=660 and the
 * value sat at x=1435, so 775px of blank separated a label from the number it belongs
 * to. A hover tint was carrying that tracking, which is why leaf rows had a hover state
 * and nothing to click. A dotted leader is what a printed table of figures uses for the
 * same job, and it works when nobody is pointing at the row.
 */
const LEADER = "mx-2 mb-[0.35em] min-w-4 flex-1 border-border/70 border-b border-dotted";

/**
 * One faint vertical line, at the row's own level.
 *
 * Painted into the row's background rather than drawn by a nested wrapper per level:
 * the padding already carries the indent, so a wrapper would only compound it.
 *
 * Deliberately one line and not one per ancestor. A guide per level was tried and is a
 * picket fence at real depth: a GIR nests to eight or nine, so a row was crosshatched by
 * seven vertical rules and the tree read as ruled paper. The line that does the work is
 * the one beside the row itself; the ancestors above it are already legible from their
 * own rows.
 */
const guides = (depth: number): CSSProperties => {
  if (depth === 0) return {};

  return {
    backgroundImage: "linear-gradient(to right, var(--color-guide) 0 1px, transparent 1px)",
    backgroundSize: "1px 100%",
    backgroundRepeat: "no-repeat",
    backgroundPosition: `calc(${depth - 1} * ${INDENT_REM}rem + ${INDENT_REM / 2}rem) 0`,
  };
};

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
      <div className={cn(NODE_GRID, ROW)} data-path={path}>
        {/*
          A leaf carries no hover state. It is not interactive, and a tint under the
          cursor on something that cannot be clicked promises a target that is not
          there. The leader does the tracking a hover was standing in for.
        */}
        <div
          className={cn("flex items-baseline py-1 pr-2", note !== null && "bg-corrected")}
          style={{ paddingLeft: `${depth * INDENT_REM + 1.5}rem`, ...guides(depth) }}
        >
          {/*
            The name never gives way. A long value squeezed it to a single character at
            375px: `MessageRefId` rendered as `M` beside its own id, which identifies
            nothing. The value truncates instead, and the full text stays in the title.
          */}
          <span className="shrink-0 font-mono text-sm text-text-muted">{name}</span>

          {value !== null && (
            <>
              <span aria-hidden="true" className={LEADER} />
              <span
                className="figure corrected-value min-w-0 truncate text-right text-sm"
                title={value}
              >
                {value}
              </span>
            </>
          )}
        </div>

        <Margin annotations={annotations} note={note} />
      </div>
    );
  }

  return (
    <div data-path={path}>
      <div className={cn(NODE_GRID, ROW)}>
        <button
          aria-expanded={open}
          className={cn(
            "group flex w-full cursor-pointer items-baseline gap-2 py-1 pr-2 text-left transition-colors duration-150 hover:bg-sunk active:translate-y-px",
            note !== null && "bg-corrected",
          )}
          onClick={() => setOpen((current) => !current)}
          style={{ paddingLeft: `${depth * INDENT_REM + 0.25}rem`, ...guides(depth) }}
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

          <span className="min-w-0 shrink truncate font-medium font-mono text-sm">{name}</span>

          {label !== null && (
            <span className="min-w-0 shrink truncate text-sm text-text-muted">{label}</span>
          )}

          {/*
            Beside the name, not in the value lane. A cardinality and a monetary amount
            are different quantities, and sharing one right-hand column put `3` and
            `2400000` in the same place down the page.
          */}
          <span className="figure shrink-0 text-text-faint text-xs">{children.length}</span>
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
 * The cell stretches its row rather than overflowing it, and that is load bearing.
 *
 * Taking it out of flow with `h-0` closes the gap a tall note opens, and was tried again
 * here on the theory that a folded note is short enough to be safe. It is not: issue 7
 * writes nine zeros into consecutive leaves of one `OverallComputation`, so nine notes
 * land on nine adjacent rows and print on top of each other. The rows are around 28px
 * and a note is 93px even folded.
 *
 * What actually shortened this page was folding the reason away, which took a note from
 * 250px to 93px and the page from 9283px to 5407px. The remaining gap beside a run of
 * corrections is the margin doing its job.
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
