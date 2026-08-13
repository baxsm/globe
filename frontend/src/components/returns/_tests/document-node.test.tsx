import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
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

describe("DocumentNode", () => {
  it("renders a leaf as a name and its value", () => {
    render(<DocumentNode depth={0} element={element("globe:ETRRate", [text("0.1000")])} parentPath="GLOBE_OECD" />);

    expect(screen.getByText("ETRRate")).toBeInTheDocument();
    expect(screen.getByText("0.1000")).toBeInTheDocument();
  });

  it("renders a container as a disclosure carrying its child count", () => {
    const container = element("globe:MessageSpec", [
      element("globe:MessageType", [text("GIR")]),
      element("globe:ReportingPeriod", [text("2024-12-31")]),
    ]);

    render(<DocumentNode depth={0} element={container} parentPath="GLOBE_OECD" />);

    expect(screen.getByRole("button", { expanded: true })).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("collapses and expands on click", async () => {
    const user = userEvent.setup();
    const container = element("globe:MessageSpec", [element("globe:MessageType", [text("GIR")])]);

    render(<DocumentNode depth={0} element={container} parentPath="GLOBE_OECD" />);
    expect(screen.getByText("MessageType")).toBeInTheDocument();

    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "false");
  });

  it("starts collapsed below the default depth", () => {
    // Opening every level would render several hundred rows with no shape to them.
    const container = element("globe:Deep", [element("globe:Child", [text("x")])]);

    render(<DocumentNode depth={5} element={container} parentPath="GLOBE_OECD" />);

    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Child")).not.toBeInTheDocument();
  });

  it("labels a repeated section by its identifier", () => {
    const section = element("globe:JurisdictionSection", [
      element("globe:Jurisdiction", [text("IE")]),
    ]);

    render(<DocumentNode depth={0} element={section} parentPath="GLOBE_OECD" />);

    // "IE" appears twice by design: once as the label on the collapsed header, and
    // once as the value of the `Jurisdiction` child inside it. The assertion is that
    // the header itself carries it, so a filer scanning collapsed sections can tell
    // them apart without opening each one.
    expect(screen.getByRole("button")).toHaveTextContent("IE");
  });

  it("addresses each node by a path from the root", () => {
    const { container } = render(
      <DocumentNode depth={0} element={element("globe:GLOBEBody")} parentPath="GLOBE_OECD" />,
    );

    // Phase 7 aligns a margin annotation to a node by this attribute.
    expect(container.querySelector('[data-path="GLOBE_OECD/GLOBEBody"]')).not.toBeNull();
  });
});
