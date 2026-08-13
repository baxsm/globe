import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/**
 * Unmount between tests.
 *
 * Testing Library only registers this itself when it detects a global `afterEach`, and
 * under this config it does not. Without it every render stays in the document and a
 * `getByText` that should match one element finds one per test that ran before it,
 * which reads as a duplicate-render bug in the component rather than as leakage.
 */
afterEach(cleanup);

/**
 * jsdom implements neither of these, and both are read during render rather than on
 * interaction, so their absence throws before any assertion runs.
 *
 * `matchMedia` is read by Motion to resolve `prefers-reduced-motion`.
 * `ResizeObserver` is constructed by Radix's presence layer.
 */
if (typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

if (typeof globalThis.ResizeObserver !== "function") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
