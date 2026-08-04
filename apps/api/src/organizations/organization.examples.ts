import {
  CreateInvitationRequest,
  CreateOrganizationRequest,
  UpdateMemberRequest,
} from "./organization.contract";

export const createOrganizationExample: CreateOrganizationRequest = {
  name: "Acme Payments",
};

export const updateMemberExample: UpdateMemberRequest = {
  role: "ADMIN",
};

export const createInvitationExample: CreateInvitationRequest = {
  email: "colleague@example.com",
  role: "MEMBER",
};
