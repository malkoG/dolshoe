import { ScryptOptions, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * Hand-wrapped rather than `promisify(scrypt)`, which resolves to the overload
 * without an options argument and so cannot carry the cost parameters.
 */
function deriveScryptKey(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, derivedKey) => {
      if (error != null) reject(error);
      else resolve(derivedKey);
    });
  });
}

/**
 * Passwords are hashed with scrypt from `node:crypto`.
 *
 * @remarks
 * argon2id is the better primitive, but it is a native module: it needs a
 * compiler in the image, an entry in the build allowlist, and it turns
 * prebuilt-binary availability on ARM and musl into a deployment concern. That
 * is a poor trade for a project whose install story is `docker compose up`.
 * scrypt is memory-hard, in the standard library, and the same family the
 * ingestion tokens already use.
 *
 * The cost parameters are stored inside each hash rather than read from these
 * constants at verification time, so raising them later leaves every existing
 * password verifiable and lets an account be re-hashed on its next sign-in.
 */
const SCHEME = "scrypt";
const COST = 2 ** 15;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const SALT_BYTES = 16;
const KEY_BYTES = 32;

/**
 * scrypt needs roughly `128 * cost * blockSize` bytes. Node's 32 MiB default
 * would reject these parameters outright, so the budget is stated rather than
 * inherited, with headroom for a future increase.
 */
function memoryBudgetFor(cost: number, blockSize: number): number {
  return 128 * cost * blockSize * 2;
}

interface EncodedPassword {
  cost: number;
  blockSize: number;
  parallelization: number;
  salt: Buffer;
  key: Buffer;
}

function encode(parameters: EncodedPassword): string {
  return [
    SCHEME,
    parameters.cost,
    parameters.blockSize,
    parameters.parallelization,
    parameters.salt.toString("base64url"),
    parameters.key.toString("base64url"),
  ].join("$");
}

/**
 * Returns `undefined` rather than throwing for anything that is not a hash this
 * module produced. The caller treats that as a failed verification and reports
 * it, because a row whose hash cannot be read is corruption, not a wrong
 * password.
 */
function decode(encoded: string): EncodedPassword | undefined {
  const [scheme, cost, blockSize, parallelization, salt, key] = encoded.split("$");
  if (scheme !== SCHEME) return undefined;
  if (cost == null || blockSize == null || parallelization == null) return undefined;
  if (salt == null || key == null) return undefined;

  const parsed = {
    cost: Number(cost),
    blockSize: Number(blockSize),
    parallelization: Number(parallelization),
    salt: Buffer.from(salt, "base64url"),
    key: Buffer.from(key, "base64url"),
  };

  const positiveIntegers = [parsed.cost, parsed.blockSize, parsed.parallelization];
  if (positiveIntegers.some((value) => !Number.isInteger(value) || value <= 0)) return undefined;
  if (parsed.salt.length === 0 || parsed.key.length === 0) return undefined;

  return parsed;
}

function deriveKey(password: string, parameters: EncodedPassword): Promise<Buffer> {
  return deriveScryptKey(
    // Normalized so a password typed with decomposed accents on one keyboard
    // still matches the same password typed with composed ones elsewhere.
    password.normalize("NFKC"),
    parameters.salt,
    parameters.key.length,
    {
      N: parameters.cost,
      r: parameters.blockSize,
      p: parameters.parallelization,
      maxmem: memoryBudgetFor(parameters.cost, parameters.blockSize),
    },
  );
}

export async function hashPassword(password: string): Promise<string> {
  const parameters: EncodedPassword = {
    cost: COST,
    blockSize: BLOCK_SIZE,
    parallelization: PARALLELIZATION,
    salt: randomBytes(SALT_BYTES),
    key: Buffer.alloc(KEY_BYTES),
  };

  return encode({ ...parameters, key: await deriveKey(password, parameters) });
}

/**
 * Returns `false` for a wrong password and for an unreadable hash alike. The two
 * are distinguished by {@link isPasswordHash}, so a caller that cares can report
 * corruption without this function having to throw on a hot authentication path.
 */
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parameters = decode(encoded);
  if (parameters == null) return false;

  const derived = await deriveKey(password, parameters);
  return derived.length === parameters.key.length && timingSafeEqual(derived, parameters.key);
}

export function isPasswordHash(encoded: string): boolean {
  return decode(encoded) != null;
}

/**
 * Verified against when no account was found, so signing in with an address that
 * does not exist costs the same as one with the wrong password.
 *
 * @remarks
 * An all-zero key, which no scrypt derivation will ever produce, so verifying
 * against it does the full amount of work and then always fails. Not a secret:
 * its only job is to spend the same CPU as a real comparison.
 */
export const ABSENT_PASSWORD_HASH = encode({
  cost: COST,
  blockSize: BLOCK_SIZE,
  parallelization: PARALLELIZATION,
  salt: Buffer.alloc(SALT_BYTES),
  key: Buffer.alloc(KEY_BYTES),
});
