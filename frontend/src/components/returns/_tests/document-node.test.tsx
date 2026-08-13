import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AnnotationIndex } from "@/lib/annotations";
import type { ErrataApplication } from "@/lib/api";
import type { GirElement } from "@/lib/document";
import DocumentNode from "../document-node";

const element = (name: string, children: GirElement["children"] = []): GirElement => ({
  kind: "element",
  name,
  attributes: [],
  children,
  paired: false,
});

const text = (value: string) => ({ kind: "text" as const, value });

const application = (xpath: string, issueNumber = 5): ErrataApplication => ({
  issueNumber,
  kind: "substitution",
  xpath,
  schemaExpected: "current tax expense after cross-allocation",
  errataApplied: "the total including deferred tax expense",
  paragraph: "16",
  reason: "GIR element 3.2.4.2.b.8 is absent",
});

/** Renders one node with no annotations, which is most of these cases. */
const renderNode = (
  node: GirElement,
  options: { depth?: number; siblings?: GirElement["children"]; index?: AnnotationIndex } = {},
) => {
  const siblings = options.siblings ?? [node];

  return render(
    <DocumentNode
      annotations={options.index ?? new AnnotationIndex([], [])}
      depth={options.depth ?? 0}
      element={node}
      parentPath="GLOBE_OECD"
      siblings={siblings}
    />,
  );
};

describe("DocumentNode", () => {
  it("renders a leaf as a name and its value", () => {
    renderNode(element("globe:ETRRate", [text("0.1000")]));

    expect(screen.getByText("ETRRate")).toBeInTheDocument();
    expect(screen.getByText("0.1000")).toBeInTheDocument();
  });

  it("renders a container as a disclosure carrying its child count", () => {
    const container = element("globe:MessageSpec", [
      element("globe:MessageType", [text("GIR")]),
      element("globe:ReportingPeriod", [text("2024-12-31")]),
    ]);

    renderNode(container);

    expect(screen.getByRole("button", { expanded: true })).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("collapses and expands on click", async () => {
    const user = userEvent.setup();
    const container = element("globe:MessageSpec", [element("globe:MessageType", [text("GIR")])]);

    renderNode(container);
    expect(screen.getByText("MessageType")).toBeInTheDocument();

    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "false");
  });

  it("starts collapsed below the default depth", () => {
    // Opening every level would render several hundred rows with no shape to them.
    const container = element("globe:Deep", [element("globe:Child", [text("x")])]);

    renderNode(container, { depth: 5 });

    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Child")).not.toBeInTheDocument();
  });

  it("labels a repeated section by its identifier", () => {
    const section = element("globe:JurisdictionSection", [
      element("globe:Jurisdiction", [text("IE")]),
    ]);

    renderNode(section);

    // "IE" appears twice by design: once as the label on the collapsed header, and
    // once as the value of the `Jurisdiction` child inside it. The assertion is that
    // the header itself carries it, so a filer scanning collapsed sections can tell
    // them apart without opening each one.
    expect(screen.getByRole("button")).toHaveTextContent("IE");
  });

  it("addresses each node by a path from the root", () => {
    const { container } = renderNode(element("globe:GLOBEBody"));

    expect(container.querySelector('[data-path="GLOBE_OECD/GLOBEBody"]')).not.toBeNull();
  });

  it("indexes repeated siblings so their paths differ", () => {
    const first = element("globe:JurisdictionSection");
    const second = element("globe:JurisdictionSection");

    const { container } = renderNode(second, { siblings: [first, second] });

    expect(
      container.querySelector('[data-path="GLOBE_OECD/JurisdictionSection[2]"]'),
    ).not.toBeNull();
  });
});

describe("the margin", () => {
  it("renders an annotation beside the node it addresses", () => {
    const node = element("globe:Total", [text("252000")]);
    // The engine addresses from inside the root; the tree's path starts at it.
    const index = new AnnotationIndex([application("globe:Total")], []);

    renderNode(node, { index });

    expect(screen.getByText(/GIR element 3.2.4.2.b.8 is absent/)).toBeInTheDocument();
  });

  it("shows the schema expectation and the value written in its place", () => {
    // The product in one line. Both have to be present, and the struck one has to be the
    // schema's, not the correction's.
    const node = element("globe:Total", [text("252000")]);
    // The engine addresses from inside the root; the tree's path starts at it.
    const index = new AnnotationIndex([application("globe:Total")], []);

    renderNode(node, { index });

    expect(screen.getByText("current tax expense after cross-allocation")).toHaveClass(
      "line-through",
    );
    expect(screen.getByText("the total including deferred tax expense")).not.toHaveClass(
      "line-through",
    );
  });

  it("cites the paragraph and links to the issue", () => {
    const node = element("globe:Total", [text("252000")]);
    // The engine addresses from inside the root; the tree's path starts at it.
    const index = new AnnotationIndex([application("globe:Total")], []);

    renderNode(node, { index });

    expect(screen.getByRole("link", { name: /Issue 05/ })).toHaveAttribute(
      "href",
      "/reference#issue-5",
    );
    expect(screen.getByText(/Paragraph 16/)).toBeInTheDocument();
  });

  it("does not annotate a node the run said nothing about", () => {
    const node = element("globe:Total", [text("252000")]);
    const index = new AnnotationIndex([application("globe:Other")], []);

    renderNode(node, { index });

    expect(screen.queryByText(/GIR element 3.2.4.2.b.8 is absent/)).not.toBeInTheDocument();
  });

  it("opens a branch that contains a correction, however deep", () => {
    // The tree opens two levels; this annotation is at three. Left closed, the margin
    // renders empty on a document that does have corrections and the surface reads as a
    // collapsed tree rather than a marked-up document.
    const deep = element("globe:GLoBETax", [
      element("globe:ETR", [element("globe:Total", [text("252000")])]),
    ]);

    // The engine's path shares the chain with the node's, which is what anchors the
    // ancestor test.
    const index = new AnnotationIndex([application("globe:GLoBETax/globe:ETR/globe:Total")], []);

    renderNode(deep, { depth: 4, index });

    expect(screen.getByText(/GIR element 3.2.4.2.b.8 is absent/)).toBeInTheDocument();
  });

  it("leaves a deep branch closed when nothing beneath it is annotated", () => {
    const deep = element("globe:GLoBETax", [
      element("globe:ETR", [element("globe:Total", [text("252000")])]),
    ]);

    renderNode(deep, { depth: 4 });

    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "false");
  });

  it("attaches an annotation to the right repeat of a section", () => {
    // The failure mode this surface is most likely to have. An annotation on the wrong
    // jurisdiction looks entirely plausible and is worse than no annotation at all.
    const first = element("globe:JurisdictionSection", [element("globe:Total", [text("1")])]);
    const second = element("globe:JurisdictionSection", [element("globe:Total", [text("2")])]);

    const index = new AnnotationIndex(
      [application("globe:JurisdictionSection[2]/globe:Total")],
      [],
    );

    renderNode(first, { index, siblings: [first, second] });
    expect(screen.queryByText(/GIR element 3.2.4.2.b.8 is absent/)).not.toBeInTheDocument();

    renderNode(second, { index, siblings: [first, second] });
    expect(screen.getByText(/GIR element 3.2.4.2.b.8 is absent/)).toBeInTheDocument();
  });
});
