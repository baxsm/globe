import { describe, expect, it } from "vitest";
import { formatPeriod, formatTimestamp } from "@/lib/utils";

/**
 * Both formatters exist to render the same string on the server and in the browser.
 *
 * A date rendered in the runtime's own zone produces one string during SSR and another
 * after hydration, which React reports as a mismatch on a page that looks correct.
 */
describe("formatPeriod", () => {
  it("keeps the stated day regardless of the local zone", () => {
    // A reporting period is a date, not an instant. Read as UTC midnight and shifted
    // into a negative offset it becomes the 30th, which is the wrong fiscal year end.
    expect(formatPeriod("2024-12-31")).toBe("31 Dec 2024");
  });

  it("ignores a time component", () => {
    expect(formatPeriod("2024-01-01T23:00:00Z")).toBe("01 Jan 2024");
  });

  it("returns the input unchanged when it is not a date", () => {
    expect(formatPeriod("not-a-date")).toBe("not-a-date");
  });
});

describe("formatTimestamp", () => {
  it("formats an instant in UTC", () => {
    expect(formatTimestamp("2026-08-13T09:30:00Z")).toBe("13 Aug 2026, 09:30");
  });

  it("returns an empty string for an unparseable value", () => {
    expect(formatTimestamp("nonsense")).toBe("");
  });
});
