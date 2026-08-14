"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import type { FC } from "react";
import Measure from "@/components/ui/measure";
import { api, type IssueReference } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import KindMark from "./kind-mark";

/**
 * The fourteen issues, as a reference a filer reads rather than a table they filter.
 *
 * Every margin annotation links here by issue number, so each entry carries an id and
 * scroll target. No filter bar, because hiding ten of fourteen entries would make the
 * set feel larger than it is, but the entries run about three screens, so there is a
 * jump list instead: navigation without removing anything from the page.
 */
const ReferenceView: FC = () => {
  const { data: issues } = useSuspenseQuery({
    queryKey: queryKeys.referenceIssues,
    queryFn: () => api.referenceIssues().then((data) => data.issues),
  });

  const { data: schema } = useSuspenseQuery({
    queryKey: queryKeys.referenceSchema,
    queryFn: () => api.referenceSchema(),
  });

  /**
   * The disapplied validation rules, which is not the same set as the suppressions.
   *
   * Five issues carry `kind: "suppression"`, but issue 3 suppresses an element rather
   * than a rule: `UTPRAttribution` is not used for 2026 filings. Only the four carrying
   * a rule number are the rules the guidance says must not be applied, and those four
   * are what the engine reports on every run. Counting the kind would state five, which
   * the guidance does not say.
   */
  const disappliedRules = issues.filter((issue) => issue.validationRule !== null);

  return (
    <Measure className="py-10">
      <h1 className="font-normal text-3xl tracking-[-0.015em]">Reference</h1>

      <p className="mt-4 max-w-prose text-lg text-text-muted leading-relaxed">
        The OECD approved the GIR XML schema in January 2025 and published guidance on{" "}
        {schema.guidanceApproved} recording {issues.length} defects in it. Each entry below is one
        defect and the correction this tool applies.
      </p>

      {/*
        The value column is `minmax(0,1fr)`, not `1fr`.
        A grid track defaults to `min-content`, so a long unbroken filename in mono
        widens the track past the viewport instead of wrapping, and the whole page
        gains a horizontal scrollbar on a phone.
      */}
      <dl className="mt-8 grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 rounded-sheet bg-ground px-5 py-4 text-sm">
        <dt className="font-mono text-micro text-text-faint uppercase tracking-[0.14em]">Schema</dt>
        <dd className="font-mono text-text-muted">{schema.schemaVersion}</dd>

        <dt className="font-mono text-micro text-text-faint uppercase tracking-[0.14em]">
          Guidance
        </dt>
        <dd className="font-mono text-text-muted">
          {schema.guidanceVersion}, approved {schema.guidanceApproved}
        </dd>

        <dt className="font-mono text-micro text-text-faint uppercase tracking-[0.14em]">Files</dt>
        <dd className="min-w-0 space-y-0.5">
          {schema.files.map((file) => (
            <div className="flex flex-wrap items-baseline gap-x-3" key={file.name}>
              {/* `break-all`: an XSD filename has no spaces to wrap at. */}
              <span className="break-all font-mono text-text-muted text-xs">{file.name}</span>
              <span className="figure text-text-faint text-xs">
                {file.bytes.toLocaleString("en-GB")} bytes
              </span>
            </div>
          ))}
        </dd>
      </dl>

      {/*
        Stated at the top rather than left to be noticed among the fourteen. Four rules
        being deliberately not applied is the least intuitive thing the product does.
      */}
      <p className="mt-6 max-w-prose leading-relaxed">
        <span className="text-ink-suppressed">
          {disappliedRules.length} of these are validation rules that must not be applied.
        </span>{" "}
        <span className="text-text-muted">
          Applying them rejects correct filings, so every validation run reports them as suppressed
          rather than silently skipping them.
        </span>
      </p>

      {/*
        A jump list, because the fourteen entries run about three screens.
        Every margin annotation in the product links here by number, so arriving at
        issue 11 and wanting issue 4 otherwise means scrolling and reading headings.
      */}
      {/*
        No rule above this. The block it follows already groups itself by sitting on the
        ground, and a rule 24px under that block reads as a mistake rather than as a
        division. Counted before this pass: five full-width rules in the first 950px of
        this page, on a surface whose job is reading.
      */}
      <nav aria-label="Issues" className="mt-8 flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <span className="font-mono text-micro text-text-faint uppercase tracking-[0.14em]">
          Jump to
        </span>

        <div className="flex flex-wrap gap-1.5">
          {issues.map((issue) => (
            <a
              className="figure rounded-sheet border border-border bg-surface px-2 py-1 text-text-muted text-xs transition-colors duration-150 hover:border-border-strong hover:bg-sunk hover:text-text"
              href={`#issue-${issue.number}`}
              key={issue.number}
            >
              {String(issue.number).padStart(2, "0")}
            </a>
          ))}
        </div>
      </nav>

      <div className="mt-10">
        {issues.map((issue) => (
          <IssueEntry issue={issue} key={issue.number} />
        ))}
      </div>
    </Measure>
  );
};

const IssueEntry: FC<{ issue: IssueReference }> = ({ issue }) => (
  // `scroll-mt` keeps the heading clear of the sticky topbar when linked to by anchor.
  // No trailing rule on the last entry, and none opening the first: fifteen rules for
  // fourteen entries turned a reading page into a table.
  <article
    className="scroll-mt-20 border-border border-b py-6 last:border-b-0"
    id={`issue-${issue.number}`}
  >
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
      <span className="figure text-text-faint text-xs">
        Issue {String(issue.number).padStart(2, "0")}
      </span>
      <KindMark kind={issue.kind} />

      {issue.validationRule !== null && (
        <span className="figure text-ink-suppressed text-xs">
          Rule {issue.validationRule} not applied
        </span>
      )}

      <span className="figure ml-auto text-text-faint text-xs">
        {issue.paragraph.includes("-") ? "Paragraphs" : "Paragraph"} {issue.paragraph}
      </span>
    </div>

    <h2 className="mt-2 font-medium text-lg leading-snug">{issue.title}</h2>

    <p className="mt-2 max-w-prose text-text-muted leading-relaxed">{issue.summary}</p>
  </article>
);

export default ReferenceView;
