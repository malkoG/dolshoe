import {
  createProjectRequestSchema,
  issueProjectTokenRequestSchema,
  issuedProjectTokenSchema,
  projectListResponseSchema,
  projectOpenApiSchemas,
  projectSchema,
  projectTokenSchema,
} from "./project.contract";
import {
  createProjectExample,
  issueProjectTokenExample,
  issuedProjectTokenExample,
  projectExample,
  projectTokenExample,
} from "./project.examples";

describe("project contract", () => {
  it("accepts the documented examples", () => {
    expect(createProjectRequestSchema.safeParse(createProjectExample).success).toBe(true);
    expect(projectSchema.safeParse(projectExample).success).toBe(true);
    expect(issueProjectTokenRequestSchema.safeParse(issueProjectTokenExample).success).toBe(true);
    expect(issuedProjectTokenSchema.safeParse(issuedProjectTokenExample).success).toBe(true);
    expect(projectTokenSchema.safeParse(projectTokenExample).success).toBe(true);
    expect(projectListResponseSchema.safeParse({ projects: [projectExample] }).success).toBe(true);
  });

  it("rejects unknown keys", () => {
    expect(
      createProjectRequestSchema.safeParse({ ...createProjectExample, retention: 30 }).success,
    ).toBe(false);
  });

  it.each([
    ["uppercase", "Checkout"],
    ["a leading hyphen", "-checkout"],
    ["a trailing hyphen", "checkout-"],
    ["consecutive hyphens", "checkout--api"],
    ["a space", "checkout api"],
  ])("rejects a slug with %s", (_description, slug) => {
    expect(createProjectRequestSchema.safeParse({ name: "Checkout", slug }).success).toBe(false);
  });

  it("keeps the stored digest and the plaintext out of a listed token", () => {
    expect(
      projectTokenSchema.safeParse({ ...projectTokenExample, tokenHash: "a".repeat(64) }).success,
    ).toBe(false);
    expect(projectTokenSchema.safeParse(issuedProjectTokenExample).success).toBe(false);
  });

  it("publishes every registered schema to OpenAPI", () => {
    expect(Object.keys(projectOpenApiSchemas).toSorted()).toEqual([
      "CreateProjectRequestV1",
      "IssueProjectTokenRequestV1",
      "IssuedProjectTokenV1",
      "ProjectListResponseV1",
      "ProjectTokenListResponseV1",
      "ProjectTokenV1",
      "ProjectV1",
    ]);
  });
});
