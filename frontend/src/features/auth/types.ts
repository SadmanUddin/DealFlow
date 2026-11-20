export type UserRole = "buyer" | "seller" | "admin";

export type AuthUser = {
  id: number;
  name?: string;
  email: string;
  role: UserRole;
  emailVerified: boolean;
  createdAt?: string;
};

export type UserProfile = AuthUser & {
  name: string;
  isActive: boolean;
  updatedAt: string;
};

export type SignInInput = {
  email: string;
  password: string;
};

export type SignUpInput = {
  name: string;
  email: string;
  password: string;
  role: "buyer" | "seller";
};

export type AuthResponse = {
  user: AuthUser;
  csrfToken: string;
  message?: string;
};

export type MessageResponse = { message: string };
