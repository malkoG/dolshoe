import { ForbiddenException } from "@nestjs/common";

import { assertSameOrigin } from "./same-origin";

const HOST = "dolshoe.example";

function request(method: string, origin?: string, host: string | undefined = HOST) {
  return { method, headers: { origin, host } };
}

describe("assertSameOrigin", () => {
  it.each(["GET", "HEAD", "OPTIONS", "get"])(
    "allows %s regardless of origin, because it changes nothing",
    (method) => {
      expect(() => assertSameOrigin(request(method, "https://attacker.example"))).not.toThrow();
    },
  );

  it("allows a write whose origin is this host", () => {
    expect(() => assertSameOrigin(request("POST", `https://${HOST}`))).not.toThrow();
  });

  it("matches on host, so a different scheme or path is still same-origin enough", () => {
    expect(() => assertSameOrigin(request("POST", `http://${HOST}`))).not.toThrow();
  });

  it("refuses a write from another origin", () => {
    expect(() => assertSameOrigin(request("POST", "https://attacker.example"))).toThrow(
      ForbiddenException,
    );
  });

  it("refuses a write whose origin is unparseable", () => {
    expect(() => assertSameOrigin(request("POST", "not a url"))).toThrow(ForbiddenException);
  });

  it("refuses a write when the host header is missing and an origin claims otherwise", () => {
    expect(() => assertSameOrigin(request("POST", "https://attacker.example", undefined))).toThrow(
      ForbiddenException,
    );
  });

  it("allows a write with no origin at all", () => {
    // Deliberate. Browsers always send Origin on cross-site requests, so its
    // absence means the caller is not a browser — curl, a script, the e2e
    // suite — and those cannot be tricked into forging anything.
    expect(() => assertSameOrigin(request("POST", undefined))).not.toThrow();
  });

  it("refuses a write carrying several origin headers", () => {
    // Ambiguous input on a security check is refused rather than guessed at.
    // Collapsing a repeated header to "no origin" would make duplicating it a
    // way around the check.
    expect(() =>
      assertSameOrigin({
        method: "POST",
        headers: { origin: [`https://${HOST}`, "https://attacker.example"], host: HOST },
      }),
    ).toThrow(ForbiddenException);
  });
});
