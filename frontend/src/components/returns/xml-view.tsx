"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowRightToLine,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  FileCode,
  WrapText,
} from "lucide-react";
import { type FC, type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import Button from "@/components/ui/button";
import EmptyState from "@/components/ui/empty-state";
import Measure from "@/components/ui/measure";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { markXml } from "@/lib/xml-marks";
import ReturnHeader from "./return-header";

/**
 * The height left below the pane's own top, so the page itself never scrolls.
 *
 * The offset cannot be a constant. The header above this pane wraps at narrow widths and
 * the marked-line summary wraps with it, so the pane's top moves between roughly 260 and
 * 400px. A fixed `100dvh-16rem` left it 52px below the fold at 1440x900 and the page
 * scrolled 84px behind a pane that was already scrolling.
 *
 * A resize listener rather than `ResizeObserver` on the pane itself: observing an element
 * whose height this then sets is a feedback loop, and the viewport is what actually
 * changes.
 */
const usePaneHeight = (ref: RefObject<HTMLDivElement | null>): number | undefined => {
  const [height, setHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    const measure = () => {
      const node = ref.current;
      if (node === null) return;

      // The pane's own top plus the space the page keeps beneath it.
      const top = node.getBoundingClientRect().top + window.scrollY;
      const room = window.innerHeight - top - PANE_BOTTOM_GAP;

      // Below the floor the pane is uncapped and the page scrolls instead. Clamping to
      // a minimum taller than the room left is what puts a second scrollbar on the
      // screen: measured on a 412x839 phone, the pane began 498px down, so a 320px
      // floor overflowed the page by 11px. One scrollbar on a short screen is right;
      // two is the bug.
      setHeight(room < PANE_MIN_HEIGHT ? undefined : room);
    };

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [ref]);

  return height;
};

// Matches the `py-8` the measure already puts below the pane, so the page ends exactly
// where the pane does rather than a rule's width past it.
const PANE_BOTTOM_GAP = 32;

// Under this there is not enough room to be worth capping, and capping anyway is what
// produces two scrollbars on one short screen.
const PANE_MIN_HEIGHT = 320;

/**
 * The wire format, with the errata-written regions marked.
 *
 * This is what makes the rest of the product checkable. A filer can be told that
 * `GIR2516` was substituted and a zero amount written beside it, or they can read the
 * bytes that leave the building and see it. Only the second is evidence.
 *
 * The export applies the errata, so this is not the stored document. That difference is
 * the point: the version keeps the filer's original figures and the export carries the
 * corrected ones.
 */
const XmlView: FC<{ returnId: string }> = ({ returnId }) => {
  const { data: record } = useSuspenseQuery({
    queryKey: queryKeys.return(returnId),
    queryFn: () => api.getReturn(returnId),
  });

  const version = record.version?.version ?? null;

  const { data: xml } = useSuspenseQuery({
    queryKey: queryKeys.xml(returnId, version ?? 0),
    queryFn: () => (version === null ? Promise.resolve("") : api.getXml(returnId, version)),
  });

  const { data: validation } = useSuspenseQuery({
    queryKey: queryKeys.validation(returnId, version),
    queryFn: () =>
      version === null
        ? Promise.resolve({ run: null, errata: [] })
        : api.getValidation(returnId, version),
  });

  const lines = useMemo(() => markXml(xml, validation.errata), [xml, validation.errata]);

  // Its own list so the stepper indexes into it rather than scanning every line.
  const markedLines = useMemo(
    () => lines.filter((line) => line.issue !== null).map((line) => line.number),
    [lines],
  );

  /**
   * Corrections written into the export, and corrections that left no line to mark.
   *
   * A filer reconciling this page against the document page needs both. Issues 2, 4 and 6
   * all land on the same serialized line, and issue 12 removes an element outright, so
   * "lines" and "corrections" are genuinely different counts of the same run rather than
   * one of them being wrong.
   */
  const { markedIssueCount, unmarkedCount } = useMemo(() => {
    const written = new Set(lines.flatMap((line) => line.issues));
    const applied = new Set(validation.errata.map(({ issueNumber }) => issueNumber));

    return {
      markedIssueCount: lines.reduce((total, line) => total + line.issues.length, 0),
      unmarkedCount: [...applied].filter((issue) => !written.has(issue)).length,
    };
  }, [lines, validation.errata]);

  /**
   * Wrapped by default.
   *
   * The serializer emits all three `AdditionalDataPoint` augmentations on one line, 933
   * characters on this fixture. Unwrapped it runs off the right edge truncated mid-word
   * and pushes its own issue tag out of sight, so the line reads as marked with no reason
   * given. Wrapping also takes the pane's scroll width from 6905px to the viewport
   * exactly, which is what the horizontal scrollbar was there to cope with.
   */
  const [wrap, setWrap] = useState(true);
  const [copied, setCopied] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [stepped, setStepped] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const available = usePaneHeight(scrollerRef);

  /**
   * Scrolls a line to the middle of the pane.
   *
   * Measured from the two rects, not `offsetTop`, which resolves against the nearest
   * positioned ancestor and not this pane. Assigning `scrollTop` rather than calling
   * `scrollTo({behavior: "smooth"})`, which does not move this pane at all in Chrome;
   * the animation comes from `scroll-smooth` on the element. `scrollIntoView` would
   * scroll the page too and take the chrome with it.
   */
  const scrollToLine = (line: number) => {
    const scroller = scrollerRef.current;
    const row = scroller?.querySelector(`[data-line="${line}"]`);
    if (!scroller || !(row instanceof HTMLElement)) return;

    const delta = row.getBoundingClientRect().top - scroller.getBoundingClientRect().top;

    scroller.scrollTop =
      scroller.scrollTop + delta - scroller.clientHeight / 2 + row.offsetHeight / 2;
  };

  // The first press lands on the first correction, not the second: until then the cursor
  // is a starting position, not somewhere the reader has been taken.
  const step = (direction: 1 | -1) => {
    if (markedLines.length === 0) return;

    const next = stepped
      ? (cursor + direction + markedLines.length) % markedLines.length
      : Math.max(0, direction === 1 ? 0 : markedLines.length - 1);

    setStepped(true);
    setCursor(next);

    const target = markedLines[next];
    if (target !== undefined) scrollToLine(target);
  };

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(xml);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Could not copy. Your browser blocked clipboard access.");
    }
  };

  // Built from the text already on screen. Refetching could hand the filer a different
  // document from the one they just read.
  const onDownload = () => {
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `${record.return.name.replace(/[^\w.-]+/g, "-")}-v${version}.xml`;
    anchor.click();

    URL.revokeObjectURL(url);
  };

  if (version === null) {
    return (
      <>
        <ReturnHeader record={record.return} />
        <Measure className="py-8">
          <EmptyState
            body="Save a version and its GIR XML appears here, with the regions the errata rewrote marked against the filer's own."
            icon={FileCode}
            title="Nothing to export yet."
          />
        </Measure>
      </>
    );
  }

  return (
    <>
      <ReturnHeader record={record.return} />

      <Measure className="py-8">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-border border-b pb-2.5">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <span className="font-mono text-micro text-text-faint uppercase tracking-[0.14em]">
              Export
            </span>
            <span className="figure text-text-faint text-xs">v{version}</span>
            <span className="figure text-text-faint text-xs">
              {new Blob([xml]).size.toLocaleString("en-GB")} bytes
            </span>
            <span className="figure text-text-faint text-xs">{lines.length} lines</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Button onClick={() => setWrap((current) => !current)} size="sm" variant="secondary">
              {wrap ? (
                <ArrowRightToLine aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
              ) : (
                <WrapText aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
              )}
              {wrap ? "No wrap" : "Wrap"}
            </Button>

            <Button onClick={onCopy} size="sm" variant="secondary">
              {copied ? (
                <Check aria-hidden="true" className="size-3.5 text-pos" strokeWidth={2} />
              ) : (
                <Copy aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
              )}
              {copied ? "Copied" : "Copy"}
            </Button>

            <Button onClick={onDownload} size="sm" variant="secondary">
              <Download aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
              Download
            </Button>
          </div>
        </div>

        {/*
          The corrections are scattered through several hundred lines, so a count on its
          own says something was marked without giving anyone a way to reach it.
        */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          {/*
            Both numbers, and why they differ.
            The document page counts corrections and this page counts lines, and they do
            not agree: the serializer puts all three `AdditionalDataPoint` augmentations
            on one line, and a rule that blanks an element leaves no line to mark at all.
            Stating one number here and a different one there, in near-identical wording,
            is the fastest way to lose a reader who is personally accountable for the
            filing. A probe that could not reconcile 33, 32 and 30 said it would not sign.
          */}
          <p className="text-text-muted text-xs">
            {markedLines.length === 0 ? (
              "No errata corrections were written into this export."
            ) : (
              <>
                <span className="text-ink-applied">{markedLines.length} lines</span> carry{" "}
                <span className="text-ink-applied">{markedIssueCount} corrections</span> rather than
                the filer's own value
                {markedIssueCount === markedLines.length
                  ? ". "
                  : ", because some lines carry more than one. "}
                {unmarkedCount > 0 && (
                  <>
                    A further <span className="figure">{unmarkedCount}</span> removed an element
                    outright, so there is no line here to mark.
                  </>
                )}
              </>
            )}
          </p>

          {markedLines.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="figure text-text-faint text-xs">
                {stepped
                  ? `${cursor + 1} of ${markedLines.length}`
                  : `${markedLines.length} marked`}
              </span>

              <Button
                aria-label="Previous correction"
                onClick={() => step(-1)}
                size="icon"
                variant="secondary"
              >
                <ChevronUp aria-hidden="true" className="size-3.5" strokeWidth={2} />
              </Button>

              <Button
                aria-label="Next correction"
                onClick={() => step(1)}
                size="icon"
                variant="secondary"
              >
                <ChevronDown aria-hidden="true" className="size-3.5" strokeWidth={2} />
              </Button>
            </div>
          )}
        </div>

        {/*
          Capped in height so the horizontal scrollbar stays in view. At full length it
          sat below several hundred lines, so reading a long line meant scrolling to the
          end of the file to reach the control that moves it.

          The cap is the space actually left below the pane's own top, measured, not a
          guessed offset. At `100dvh-16rem` the pane began 308px down a 900px viewport
          and was allowed 644px, so it ended 52px below the fold and the page scrolled
          84px behind a pane that was already scrolling. Two scrollbars for one screen is
          invisible in a screenshot and obvious with a wheel, and the offset that avoids
          it changes with the header, which wraps at narrow widths.
        */}
        {/*
          Focusable and labelled, because it scrolls. A pane a mouse can scroll and a
          keyboard cannot is the whole export unreachable without a pointer, which axe
          rates serious and is right to.

          A `section` rather than a div with `role="region"`, and the `tabIndex` stays.
          Biome reads a tabindex on a section as putting a non-interactive element in the
          tab order and offers to delete it. Taking that fix reintroduces the axe failure
          this line exists to close: a region that scrolls has to be focusable or its
          content is unreachable without a pointer, which is WCAG 2.1.1. The rule does not
          model the scrollable case, so it is suppressed here and nowhere else.
        */}
        <section
          aria-label={`GIR export, version ${version}, ${lines.length} lines`}
          className="mt-4 scroll-smooth overflow-auto overscroll-contain rounded-sheet border border-border bg-surface"
          ref={scrollerRef}
          style={{ maxHeight: available }}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be keyboard reachable
          tabIndex={0}
        >
          <pre
            className={cn(
              "py-2 font-mono text-xs leading-[1.7]",
              wrap ? "w-full" : "w-max min-w-full",
            )}
          >
            <code>
              {lines.map((line) => {
                // The one the stepper is currently on, so a jump has a visible landing.
                const current = stepped && markedLines[cursor] === line.number;

                return (
                  <div
                    className={cn(
                      "grid grid-cols-[3.5rem_minmax(0,1fr)] gap-4 px-3 transition-colors duration-300",
                      line.issue !== null && "bg-ink-applied/[0.06]",
                      current && "bg-ink-applied/[0.14]",
                    )}
                    data-line={line.number}
                    key={line.number}
                  >
                    {/* Sticky, or a long line takes its own number off screen. */}
                    <span
                      className={cn(
                        "sticky left-0 select-none text-right tabular-nums",
                        // Repeats the row's own ground, so the number does not sit on a
                        // different colour from the line it belongs to once it is pinned.
                        // Full strength, not `/60`. At 60% the numbers measured 2.42:1
                        // against the pane, and a line number is what a reader uses to
                        // find the line the stepper just named.
                        line.issue === null
                          ? "bg-surface text-text-faint"
                          : "bg-marked-line text-ink-applied",
                        current && "bg-marked-line-current",
                      )}
                    >
                      {line.number}
                    </span>

                    <span className={cn(wrap ? "whitespace-pre-wrap break-all" : "whitespace-pre")}>
                      {line.text}
                      {/*
                        Every issue on the line, not the first. The three augmentations
                        serialize onto one 933-character line, which was tagged "issue 02"
                        alone while issues 04 and 06 appeared nowhere in the export.
                      */}
                      {line.issues.length > 0 && (
                        <span className="ml-3 select-none text-ink-applied">
                          {line.issues
                            .map((issue) => `issue ${String(issue).padStart(2, "0")}`)
                            .join(", ")}
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </code>
          </pre>
        </section>
      </Measure>
    </>
  );
};

export default XmlView;
