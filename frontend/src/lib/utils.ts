import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

/**
 * A timestamp rendered the same on the server and in the browser.
 *
 * `toLocaleString` reads the runtime's zone, so the server renders one string and the
 * client another, and React reports a hydration mismatch on a page that looks correct.
 * UTC is stated explicitly and labelled, rather than being implied by a bare date.
 */
export const formatTimestamp = (value: string | Date): string => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  }).format(date);
};

/** A reporting period is a date-only string and must not be shifted into a local zone. */
export const formatPeriod = (value: string): string => {
  const [year, month, day] = value.slice(0, 10).split("-");
  if (year === undefined || month === undefined || day === undefined) return value;

  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
};
