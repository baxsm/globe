import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Checks the committed XSDs against the sizes and hashes published by the OECD and
 * recorded in docs/schema-version.md.
 *
 * This guards one specific accident. Two of the three files use CRLF line endings. Any
 * tooling that normalises them, git's own eol=lf included, rewrites the bytes while
 * leaving a file that still parses as the same schema. The correctness of everything
 * downstream is defined by these exact bytes, so drift has to fail loudly and early
 * rather than surface as a validation result nobody can reproduce.
 */

interface PinnedFile {
  readonly name: string;
  readonly bytes: number;
  readonly sha256: string;
}

const PINNED: readonly PinnedFile[] = [
  {
    name: "GLOBEXML_v1.0.xsd",
    bytes: 129_292,
    sha256: "304c9d6066722c0a141addcc8aaa7b4b01ec85ccf8cdba4ab88cc4ada74fc681",
  },
  {
    name: "isoglobetypes_v1.1.xsd",
    bytes: 106_560,
    sha256: "fe1c94e154d9a6dfaddea675efcb2175c447efc492e9e65c654094bd508ef01b",
  },
  {
    name: "oecdglobetypes_v5.0.xsd",
    bytes: 9_855,
    sha256: "cd6cc0ccce150a40d44c7dd485192b389acc873c11289d526c8a0f0cf0a68d9c",
  },
];

const failures: string[] = [];

for (const pinned of PINNED) {
  const path = fileURLToPath(new URL(`../src/schema/xsd/${pinned.name}`, import.meta.url));

  let contents: Buffer;
  try {
    contents = readFileSync(path);
  } catch {
    failures.push(`${pinned.name}: missing`);
    continue;
  }

  const sha256 = createHash("sha256").update(contents).digest("hex");
  if (contents.length !== pinned.bytes || sha256 !== pinned.sha256) {
    const crlf = contents.includes("\r\n") ? "has CRLF" : "no CRLF";
    failures.push(
      `${pinned.name}: expected ${pinned.bytes} bytes / ${pinned.sha256}, ` +
        `found ${contents.length} bytes / ${sha256} (${crlf})`,
    );
  }
}

if (failures.length > 0) {
  console.error("committed schema does not match the published package:");
  for (const failure of failures) console.error(`  ${failure}`);
  console.error("\nline ending normalisation is the usual cause; see docs/schema-version.md");
  process.exit(1);
}

console.log(`schema fixtures match the published package (${PINNED.length} files)`);
