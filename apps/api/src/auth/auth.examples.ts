import { LoginRequest, RegisterRequest } from "./auth.contract";

export const registerExample: RegisterRequest = {
  email: "ops@example.com",
  name: "Ops",
  password: "correct horse battery staple",
};

export const loginExample: LoginRequest = {
  email: "ops@example.com",
  password: "correct horse battery staple",
};
