const sanitize = (value: string): string => value.replace(/\s+/g, " ").trim();

type LogLevel = "error" | "warn" | "info" | "debug";

const PRIORITY: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };

const configuredLevel = (): LogLevel => {
  const raw = process.env.LOG_LEVEL?.toLowerCase();
  return raw !== undefined && raw in PRIORITY ? (raw as LogLevel) : "info";
};

const shouldLog = (level: LogLevel): boolean => PRIORITY[level] <= PRIORITY[configuredLevel()];

const format = (data: string | string[] | unknown): string => {
  if (Array.isArray(data)) return `Details: ${sanitize(data.join(" | "))}`;
  if (data instanceof Error) return `${data.name}: ${sanitize(data.message)}`;
  if (typeof data === "object" && data !== null) {
    const entries = Object.entries(data)
      .map(([key, value]) => `${key}: ${sanitize(String(value))}`)
      .join(" | ");
    return `Details: ${entries}`;
  }
  return `Details: ${sanitize(String(data))}`;
};

const write = (level: LogLevel, path: string, data: string | string[] | unknown): void => {
  if (!shouldLog(level)) return;
  const line = `[${level.toUpperCase()}] Path: ${path} | ${format(data)}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else if (level === "info") console.info(line);
  else console.debug(line);
};

export const logger = {
  error: (path: string, data: string | string[] | unknown) => write("error", path, data),
  warn: (path: string, data: string | string[] | unknown) => write("warn", path, data),
  info: (path: string, data: string | string[] | unknown) => write("info", path, data),
  debug: (path: string, data: string | string[] | unknown) => write("debug", path, data),
};
