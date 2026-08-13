# globe

Build, validate and correct GloBE Information Returns against the OECD Pillar Two XML schema and the
guidance that supersedes parts of it.

## Why it exists

The OECD published the GIR XML Schema in January 2025. In June 2026 it published guidance
documenting fourteen defects in that schema, along with the workarounds filers must apply. Four of
the fourteen are validation rules that must not be applied at all, because applying them rejects
correct filings.

So a schema-valid return is not necessarily a correct return. `globe` implements the return, the
calculations and the fourteen fixes, and shows both at once: what the schema asks for, and what the
guidance requires instead. Every applied fix cites the paragraph it comes from.

## Layout

```
engine/     GIR logic: parsing, calculation, validation, errata. No I/O.
backend/    Bun + Hono API
frontend/   Next.js app
```

`engine/` imports nothing from `backend/` or `frontend/`, so its behaviour is testable by plain
numeric assertion.

## Stack

TypeScript throughout. `decimal.js` for money and rates, because two of the validation rules turn on
four-decimal rounding inside a one percent tolerance and floats cannot express that reliably.

## Setup

Requires [Bun](https://bun.sh) 1.3 or newer.

```bash
bun install
bun test
```
