import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * Validates a document against the committed XSDs using libxml2, through lxml.
 *
 * This is deliberately an external validator rather than a check written here. A
 * hand-rolled conformance check would be written from the same reading of the schema
 * that produced the serializer, so it would agree with the serializer's mistakes. The
 * point of this layer is to disagree.
 *
 * Requires python with lxml. Absent that, callers get `available: false` rather than a
 * false pass, so a missing dependency can never look like a clean validation.
 */

export interface XsdValidationError {
  readonly line: number;
  readonly message: string;
}

export type XsdValidationResult =
  | { readonly available: false; readonly reason: string }
  | { readonly available: true; readonly valid: true }
  | {
      readonly available: true;
      readonly valid: false;
      readonly errors: readonly XsdValidationError[];
    };

const SCHEMA_PATH = fileURLToPath(new URL("./xsd/GLOBEXML_v1.0.xsd", import.meta.url));

const SCRIPT = `
import json, sys
try:
    from lxml import etree
except ImportError:
    print(json.dumps({"available": False, "reason": "lxml is not installed"}))
    sys.exit(0)

schema_path, doc_path = sys.argv[1], sys.argv[2]
try:
    schema = etree.XMLSchema(etree.parse(schema_path))
    doc = etree.parse(doc_path)
except etree.XMLSyntaxError as exc:
    print(json.dumps({"available": True, "valid": False,
                      "errors": [{"line": getattr(exc, "lineno", 0) or 0, "message": str(exc)}]}))
    sys.exit(0)

if schema.validate(doc):
    print(json.dumps({"available": True, "valid": True}))
else:
    print(json.dumps({"available": True, "valid": False,
                      "errors": [{"line": e.line, "message": e.message} for e in schema.error_log]}))
`;

const PYTHON_COMMANDS = ["python", "python3"] as const;

/** Validates a file already on disk. */
export const validateFileAgainstXsd = (documentPath: string): XsdValidationResult => {
  let lastReason = "no python interpreter found";

  for (const command of PYTHON_COMMANDS) {
    const run = spawnSync(command, ["-c", SCRIPT, SCHEMA_PATH, documentPath], {
      encoding: "utf8",
    });

    if (run.error !== undefined || run.status !== 0) {
      lastReason = run.stderr?.trim() || `${command} exited with ${String(run.status)}`;
      continue;
    }

    try {
      return JSON.parse(run.stdout) as XsdValidationResult;
    } catch {
      lastReason = `could not read validator output: ${run.stdout.slice(0, 200)}`;
    }
  }

  return { available: false, reason: lastReason };
};
