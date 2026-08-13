import { randomBytes, type ScryptOptions, scrypt, timingSafeEqual } from "node:crypto";

/**
 * Password hashing through `node:crypto`, not a runtime global.
 *
 * `Bun.password` is the shorter route and ties every login to one runtime. This code
 * runs under Bun in production and under Node in the test suite, so a hash that exists
 * only on one of them throws in exactly the place the behaviour is checked.
 *
 * scrypt is memory-hard, in the standard library, and needs no native dependency.
 */

/**
 * Wrapped by hand rather than with `promisify`, whose typing collapses the overload
 * that takes options and leaves the cost parameters unsettable.
 */
const scryptAsync = (
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });

/**
 * Cost parameters, stored with each hash.
 *
 * Written into the encoded string rather than read from here at verification time, so
 * raising the cost later leaves existing passwords verifiable instead of locking every
 * account out.
 */
const COST = 16384;
const BLOCK_SIZE = 8;
const PARALLELISATION = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

const derive = (password: string, salt: Buffer, keyLength: number): Promise<Buffer> =>
  scryptAsync(password.normalize("NFKC"), salt, keyLength, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELISATION,
    // scrypt needs memory proportional to N*r*128; the default ceiling is below what
    // N=16384 asks for, so it is raised here or the call fails outright.
    maxmem: 64 * 1024 * 1024,
  });

/** `scrypt$N$r$p$salt$hash`, everything needed to verify it later. */
export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, KEY_LENGTH);

  return [
    "scrypt",
    COST,
    BLOCK_SIZE,
    PARALLELISATION,
    salt.toString("base64"),
    key.toString("base64"),
  ].join("$");
};

/**
 * Verifies a password against a stored hash.
 *
 * The comparison is `timingSafeEqual`, so the time taken does not depend on how many
 * leading bytes matched. A plain `===` on the encoded strings leaks that through timing.
 * Returns false rather than throwing on a malformed stored value: a corrupted row must
 * not authenticate anyone, and must not crash the login route either.
 */
export const verifyPassword = async (password: string, stored: string): Promise<boolean> => {
  const [scheme, cost, blockSize, parallelisation, salt, expected] = stored.split("$");

  if (scheme !== "scrypt" || salt === undefined || expected === undefined) return false;
  if (cost === undefined || blockSize === undefined || parallelisation === undefined) return false;

  const expectedKey = Buffer.from(expected, "base64");

  const actual = await scryptAsync(
    password.normalize("NFKC"),
    Buffer.from(salt, "base64"),
    expectedKey.length,
    {
      N: Number(cost),
      r: Number(blockSize),
      p: Number(parallelisation),
      maxmem: 64 * 1024 * 1024,
    },
  );

  if (actual.length !== expectedKey.length) return false;
  return timingSafeEqual(actual, expectedKey);
};
