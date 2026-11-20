import { createContext } from "react";
import type { AuthUser, SignInInput, SignUpInput } from "./types";

export type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  initializationError: Error | null;
  isSigningIn: boolean;
  isSigningUp: boolean;
  isSigningOut: boolean;
  login: (input: SignInInput) => Promise<AuthUser>;
  register: (input: SignUpInput) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);
