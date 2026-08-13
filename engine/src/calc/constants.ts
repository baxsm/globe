import Decimal from "decimal.js";

/**
 * Limits the schema and the validation rules impose, as named values rather than
 * literals scattered through the calculations.
 *
 * Every one of these was read out of GLOBEXML_v1.0.xsd or the June 2026 guidance, and
 * each is the direct cause of one of the fourteen issues. The `globe:percentage` type
 * in the schema reads, in full:
 *
 *   <xsd:restriction base="xsd:decimal">
 *     <xsd:minInclusive value="0"/>
 *     <xsd:maxInclusive value="1"/>
 *     <xsd:fractionDigits value="4"/>
 *   </xsd:restriction>
 *
 * so the bounds below are not a policy chosen here. They are what the document is
 * allowed to carry, and the gap between them and the true computed value is the thing
 * this project exists to show.
 */

/** Lower bound of `globe:percentage`. Issue 8: a real ETR can fall below it. */
export const PERCENTAGE_MIN = new Decimal(0);

/** Upper bound of `globe:percentage`. Issue 8: a real ETR can rise above it. */
export const PERCENTAGE_MAX = new Decimal(1);

/**
 * `fractionDigits` on `globe:percentage`, and the rounding the validation rules allow.
 *
 * Issue 9, guidance paragraph 27: calculation-based rules permit rounding to four
 * decimals within a 1 percent tolerance, and a very small TopUpTaxPercentage rounded to
 * four decimals can breach that tolerance on its own.
 *
 * Issue 11, paragraph 33: an ownership percentage of 0.001 percent is 0.00001 as a
 * fraction, which has five fraction digits. It is unreportable twice over: the schema
 * rejects the precision, and rounding to four decimals turns it into the zero that rule
 * 70028 forbids.
 */
export const PERCENTAGE_FRACTION_DIGITS = 4;

/**
 * The tolerance calculation-based validation rules allow, from the GIR Status Message
 * XML Schema and User Guide, cited at guidance paragraph 27.
 *
 * Relative, not absolute. One percent of the expected value, never one unit.
 */
export const CALCULATION_TOLERANCE = new Decimal("0.01");

/** The minimum top-up tax rate under the GloBE rules. */
export const MINIMUM_RATE = new Decimal("0.15");
