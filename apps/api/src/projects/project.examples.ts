import {
  CreateProjectRequest,
  IssueProjectTokenRequest,
  IssuedProjectToken,
  Project,
  ProjectToken,
} from "./project.contract";

export const createProjectExample: CreateProjectRequest = {
  name: "Checkout API",
};

export const projectExample: Project = {
  id: "3f1d0a4c-6b2e-4f7a-9c5d-8e1b2a3c4d5e",
  slug: "checkout-api",
  name: "Checkout API",
  createdAt: "2026-08-04T09:00:00.000Z",
};

export const issueProjectTokenExample: IssueProjectTokenRequest = {
  name: "production",
};

export const issuedProjectTokenExample: IssuedProjectToken = {
  id: "b7c4e8a1-2d3f-4a5b-8c6d-9e0f1a2b3c4d",
  name: "production",
  prefix: "a1b2c3d4e5f6",
  createdAt: "2026-08-04T09:01:00.000Z",
  lastUsedAt: null,
  revokedAt: null,
  token: "dsh_a1b2c3d4e5f6_TFhQb2xzaG9lRXhhbXBsZVNlY3JldFZhbHVlSGVyZQ",
};

export const projectTokenExample: ProjectToken = {
  id: "b7c4e8a1-2d3f-4a5b-8c6d-9e0f1a2b3c4d",
  name: "production",
  prefix: "a1b2c3d4e5f6",
  createdAt: "2026-08-04T09:01:00.000Z",
  lastUsedAt: "2026-08-04T09:05:12.480Z",
  revokedAt: null,
};
