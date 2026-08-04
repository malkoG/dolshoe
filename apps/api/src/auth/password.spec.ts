import { ABSENT_PASSWORD_HASH, hashPassword, isPasswordHash, verifyPassword } from "./password";

const PASSWORD = "correct horse battery staple";

describe("hashPassword", () => {
  it("produces a hash the same password verifies against", async () => {
    const encoded = await hashPassword(PASSWORD);

    expect(await verifyPassword(PASSWORD, encoded)).toBe(true);
  });

  it("rejects a different password", async () => {
    const encoded = await hashPassword(PASSWORD);

    expect(await verifyPassword(`${PASSWORD} `, encoded)).toBe(false);
    expect(await verifyPassword("", encoded)).toBe(false);
  });

  it("salts, so the same password hashes differently every time", async () => {
    const first = await hashPassword(PASSWORD);
    const second = await hashPassword(PASSWORD);

    expect(second).not.toBe(first);
    expect(await verifyPassword(PASSWORD, first)).toBe(true);
    expect(await verifyPassword(PASSWORD, second)).toBe(true);
  });

  it("treats passwords that normalize to the same text as equal", async () => {
    // The same character composed and decomposed: one keyboard produces "é" as
    // a single code point, another as "e" plus a combining accent.
    const encoded = await hashPassword("café");

    expect(await verifyPassword("café", encoded)).toBe(true);
  });
});

describe("verifyPassword", () => {
  it("reads the cost parameters out of the stored hash rather than the current constants", async () => {
    // A hash written when the work factor was lower still verifies, which is
    // what lets the cost be raised without invalidating every password.
    const cheap = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$";
    const encoded = await hashPassword(PASSWORD);
    const [, cost] = encoded.split("$");

    expect(Number(cost)).toBeGreaterThan(16_384);
    expect(await verifyPassword(PASSWORD, `${cheap}${"a".repeat(43)}`)).toBe(false);
    expect(await verifyPassword(PASSWORD, encoded)).toBe(true);
  });

  it.each([
    ["an empty value", ""],
    ["another scheme", "argon2$65536$8$1$c2FsdA$a2V5"],
    ["too few fields", "scrypt$32768$8$1$c2FsdA"],
    ["a non-numeric cost", "scrypt$fast$8$1$c2FsdA$a2V5"],
    ["a zero cost", "scrypt$0$8$1$c2FsdA$a2V5"],
    ["an empty salt", "scrypt$32768$8$1$$a2V5"],
    ["arbitrary text", "not a hash at all"],
  ])("returns false for %s rather than throwing", async (_description, value) => {
    expect(await verifyPassword(PASSWORD, value)).toBe(false);
    expect(isPasswordHash(value)).toBe(false);
  });
});

describe("ABSENT_PASSWORD_HASH", () => {
  it("is a readable hash that nothing verifies against", async () => {
    // Readable so verifying against it costs a full derivation, which is what
    // makes an unknown address indistinguishable from a wrong password.
    expect(isPasswordHash(ABSENT_PASSWORD_HASH)).toBe(true);
    expect(await verifyPassword(PASSWORD, ABSENT_PASSWORD_HASH)).toBe(false);
    expect(await verifyPassword("", ABSENT_PASSWORD_HASH)).toBe(false);
  });
});
