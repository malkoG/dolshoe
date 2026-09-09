import {
  CreateInvitationRequest,
  CreateOrganizationRequest,
  UpdateMemberRequest,
  UpdateOrganizationRequest,
} from "./organization.contract";

export const createOrganizationExample: CreateOrganizationRequest = {
  name: "Acme Payments",
};

export const updateOrganizationExample: UpdateOrganizationRequest = {
  name: "Acme Payments, Inc.",
};

export const updateMemberExample: UpdateMemberRequest = {
  role: "ADMIN",
};

export const createInvitationExample: CreateInvitationRequest = {
  githubLogin: "octocat",
  role: "MEMBER",
};
