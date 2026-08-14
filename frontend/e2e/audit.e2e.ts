import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import Color from "colorjs.io";

/**
 * The mechanical half of the audit, per route, at both widths.
 *
 * Every check here reads a number off the DOM or names something present or absent.
 * Judgement lives in the audit skill and is not gateable; a measurement nobody can
 * re-run is worthless the day after it is taken, so these are committed and fail the
 * build.
 *
 * The fixture is written by `e2e/seed-audit.mjs` and carries a return with 33 errata
 * applications. Auditing an empty account measures the empty state and nothing else,
 * which is how a document surface ships unexamined.
 */
const FIXTURE_PATH = new URL("./.audit-fixture.json", import.meta.url);

interface Fixture {
  readonly email: string;
  readonly password: string;
  readonly id: string;
  readonly secondId: string;
}

const fixture: Fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));

const routes = [
  { name: "returns", path: "/returns" },
  { name: "document", path: `/returns/${fixture.id}` },
  { name: "xml", path: `/returns/${fixture.id}/xml` },
  { name: "versions", path: `/returns/${fixture.id}/versions` },
  { name: "empty-document", path: `/returns/${fixture.secondId}` },
  { name: "reference", path: "/reference" },
] as const;

const signIn = async (page: Page) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(fixture.email);
  await page.getByLabel("Password").fill(fixture.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/returns$/);
};

/**
 * A bordered, radiused box directly inside another one.
 *
 * Interactive elements are excluded deliberately. A naive detector counts every 28px
 * icon button as a nested box and reports a clean page as sixteen failures, which is
 * how a check like this gets switched off.
 */
const nestedContainers = () => {
  const isContainer = (el: Element) => {
    if (["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA", "LABEL"].includes(el.tagName)) return false;
    if (el.getAttribute("role") === "button") return false;
    const s = getComputedStyle(el);
    const widths = [
      s.borderTopWidth,
      s.borderRightWidth,
      s.borderBottomWidth,
      s.borderLeftWidth,
    ].map(Number.parseFloat);
    return (
      widths.every((x) => x > 0) &&
      s.borderTopStyle !== "none" &&
      Number.parseFloat(s.borderRadius) > 0
    );
  };

  const main = document.querySelector("main");
  if (main === null) return [];

  const found: string[] = [];
  for (const el of main.querySelectorAll("*")) {
    if (!isContainer(el)) continue;
    let parent = el.parentElement;
    while (parent !== null && parent !== main) {
      if (isContainer(parent)) {
        found.push(`${el.tagName}.${String(el.className).slice(0, 80)}`);
        break;
      }
      parent = parent.parentElement;
    }
  }
  return found;
};

/**
 * Hover styling on something that cannot be clicked, which promises a target that is
 * not there. The most repeated complaint across every project in this body of work.
 */
const hoverOnDead = () => {
  const interactive = (el: Element) =>
    ["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA", "SUMMARY", "LABEL"].includes(el.tagName) ||
    ["button", "link", "menuitem", "option", "tab"].includes(el.getAttribute("role") ?? "") ||
    ((el as HTMLElement).tabIndex ?? -1) >= 0;

  const found: string[] = [];
  for (const el of document.querySelectorAll("main *")) {
    const cls = String(el.className);
    if (!/(^|\s)hover:/.test(cls)) continue;
    if (interactive(el)) continue;
    if (el.closest("button, a, [role=button], label") !== null) continue;
    found.push(`${el.tagName}.${cls.slice(0, 100)}`);
  }
  return found;
};

/** Tailwind v4 defaults a button to `cursor: default`, which is "nothing looks clickable". */
const missingPointer = () => {
  const found: string[] = [];
  for (const el of document.querySelectorAll<HTMLButtonElement>("button, [role=button]")) {
    if (el.disabled) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (getComputedStyle(el).cursor !== "pointer") {
      found.push(`${el.tagName}.${String(el.className).slice(0, 80)}`);
    }
  }
  return found;
};

/**
 * Horizontal for everything; vertical only for elements that float.
 *
 * Checking the bottom edge of every element reports any page taller than the viewport
 * as a hundred failures, which describes a long page rather than a bug. The defect
 * worth catching is a fixed overlay whose footer sits below the fold and cannot be
 * scrolled to.
 */
const offScreen = () => {
  const w = window.innerWidth;
  const h = window.innerHeight;

  const floats = (el: Element) => {
    let p: Element | null = el;
    while (p !== null && p !== document.body) {
      const pos = getComputedStyle(p).position;
      if (pos === "fixed" || pos === "absolute") return true;
      p = p.parentElement;
    }
    return false;
  };

  const scrollable = (el: Element) => {
    let p = el.parentElement;
    while (p !== null && p !== document.body) {
      const s = getComputedStyle(p);
      const o = s.overflowX + s.overflowY;
      if (o.includes("auto") || o.includes("scroll")) return true;
      p = p.parentElement;
    }
    return false;
  };

  const found: string[] = [];
  for (const el of document.querySelectorAll("body *")) {
    if (el.classList.contains("sr-only")) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (scrollable(el)) continue;
    const label = `${el.tagName}.${String(el.className).slice(0, 60)}`;
    if (r.right > w + 1 || r.left < -1) {
      found.push(`x:${label} right=${Math.round(r.right)} left=${Math.round(r.left)}`);
      continue;
    }
    if (floats(el) && (r.bottom > h + 1 || r.top < -1)) {
      found.push(`y:${label} bottom=${Math.round(r.bottom)}`);
    }
  }
  return found;
};

/**
 * Two scrollbars for one screen. A full-height panel sized against the viewport inside
 * a padded pane overflows by exactly that inset, so the page scrolls behind a panel
 * that is already scrolling. Invisible in a screenshot, obvious with a wheel.
 *
 * This catches the state, not every cause: reintroducing a known bad height did not
 * always make it fail. A failure is real, a pass is weak evidence.
 */
const nestedScroll = () => {
  const main = document.querySelector("main");
  if (main === null) return [];
  if (document.documentElement.scrollHeight <= window.innerHeight + 1) return [];

  const found: string[] = [];
  for (const el of main.querySelectorAll("*")) {
    if (!["auto", "scroll"].includes(getComputedStyle(el).overflowY)) continue;
    if (el.scrollHeight > el.clientHeight + 1) {
      found.push(`${el.tagName}.${String(el.className).slice(0, 60)}`);
    }
  }
  return found;
};

/**
 * Contrast, computed rather than eyeballed.
 *
 * `getComputedStyle` returns `oklch()`/`oklab()`/`lab()` and the format varies per
 * property, so the string is parsed with a library that handles every modern space. A
 * regex over `oklch(0.6 0.2 250)` yields numbers that look like an answer and are not.
 */
const textSamples = () => {
  /**
   * Every background between the element and the body, nearest first.
   *
   * Returning the first non-transparent one is wrong wherever that layer is itself
   * translucent. The XML view marks a corrected line with the applied ink at 6% alpha
   * and writes its label in that same ink at full strength, so a naive read compared
   * the ink against itself and reported 1.00:1: a manufactured failure on a line that
   * is perfectly legible. The stack is composited below instead.
   */
  const backgroundsOf = (el: Element) => {
    const layers: string[] = [];
    let p: Element | null = el;
    while (p !== null) {
      const c = getComputedStyle(p).backgroundColor;
      if (c !== "" && c !== "rgba(0, 0, 0, 0)" && c !== "transparent") layers.push(c);
      p = p.parentElement;
    }
    layers.push(getComputedStyle(document.body).backgroundColor);
    return layers;
  };

  const out: {
    color: string;
    bg: string[];
    size: number;
    weight: string;
    sample: string;
  }[] = [];
  const seen = new Set<string>();

  for (const el of document.querySelectorAll("body *")) {
    if (el.children.length > 0) continue;
    const text = (el.textContent ?? "").trim();
    if (text.length === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.opacity === "0") continue;

    const layers = backgroundsOf(el);
    const key = `${s.color}|${layers.join(",")}|${s.fontSize}|${s.fontWeight}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      color: s.color,
      bg: layers,
      size: Number.parseFloat(s.fontSize),
      weight: s.fontWeight,
      sample: text.slice(0, 40),
    });
  }
  return out;
};

/**
 * The effective background, compositing the stack from the body upwards.
 *
 * A translucent layer over another translucent layer is what the eye actually receives,
 * and reading only the nearest one turns a legible 6%-tinted row into a reported 1.00:1
 * failure. `layers` arrives nearest-first, so it is walked in reverse.
 */
const flatten = (layers: readonly string[]): Color => {
  let base = new Color("srgb", [1, 1, 1]);

  for (const layer of [...layers].reverse()) {
    const over = new Color(layer).to("srgb");
    const alpha = over.alpha as number;
    base = new Color(
      "srgb",
      over.coords.map((c, i) => c * alpha + (base.coords[i] ?? 0) * (1 - alpha)),
    );
  }

  return base;
};

const contrast = (fg: string, layers: readonly string[]): number => {
  const background = flatten(layers);
  const text = new Color(fg).to("srgb");
  const alpha = text.alpha as number;

  // Text can be translucent too, and the same compositing applies to it.
  const composited = new Color(
    "srgb",
    text.coords.map((c, i) => c * alpha + (background.coords[i] ?? 0) * (1 - alpha)),
  );

  return Math.abs(Color.contrast(background, composited, "WCAG21"));
};

for (const route of routes) {
  test(`audit ${route.name}`, async ({ page }, testInfo) => {
    await signIn(page);
    await page.goto(route.path);
    await page.waitForLoadState("networkidle");
    // Motion settles before geometry is read, or a mid-transition frame reads as a bug.
    await page.waitForTimeout(500);

    // Read back rather than trusting the project's declared viewport. A resize that
    // silently does not take makes every responsive number in this file a lie.
    const width = await page.evaluate(() => window.innerWidth);
    testInfo.annotations.push({ type: "innerWidth", description: String(width) });

    expect(await page.evaluate(nestedContainers), `nested containers ${route.name}`).toEqual([]);
    expect(await page.evaluate(hoverOnDead), `hover on non-interactive ${route.name}`).toEqual([]);
    expect(await page.evaluate(missingPointer), `pointer cursor ${route.name}`).toEqual([]);
    expect(await page.evaluate(offScreen), `off screen ${route.name}`).toEqual([]);
    expect(await page.evaluate(nestedScroll), `nested scroll ${route.name}`).toEqual([]);

    const hScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(hScroll, `horizontal page scroll ${route.name}`).toBe(false);

    const samples = await page.evaluate(textSamples);
    const failures = samples
      .map((s) => ({ ...s, ratio: contrast(s.color, s.bg) }))
      .filter((s) => {
        const large = s.size >= 24 || (s.size >= 18.66 && Number(s.weight) >= 700);
        return s.ratio < (large ? 3 : 4.5);
      })
      .map((s) => `${s.ratio.toFixed(2)}:1 ${s.size}px "${s.sample}"`);
    expect(failures, `WCAG AA contrast ${route.name}`).toEqual([]);

    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(
      serious.map((v) => `${v.id}: ${v.nodes.length} nodes`),
      `axe serious/critical ${route.name}`,
    ).toEqual([]);

    // Moderate findings are judgement calls, counted rather than gated: a suite that
    // fails on heading order is a suite that gets switched off.
    const moderate = axe.violations.filter((v) => v.impact !== "serious" && v.impact !== "critical");
    testInfo.annotations.push({
      type: "axe-moderate",
      description: moderate.map((v) => `${v.id}:${v.nodes.length}`).join(", ") || "none",
    });
  });
}
