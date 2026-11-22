import { useCallback, useEffect, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  authQueryKeys,
  normalizeAuthError,
  restoreSession,
  signIn as signInRequest,
  signOut as signOutRequest,
  signUp as signUpRequest,
} from "./api";
import { AuthContext, type AuthContextValue } from "./auth-context";
import { clearPrivateQueryCache } from "@/app/providers/query-cache";

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const sessionQuery = useQuery({
    queryKey: authQueryKeys.session,
    queryFn: restoreSession,
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    const onSessionExpired = () => {
      queryClient.setQueryData(authQueryKeys.session, null);
      void clearPrivateQueryCache(queryClient);
      queryClient.removeQueries({ queryKey: authQueryKeys.profile });
    };
    window.addEventListener("dealflow:session-expired", onSessionExpired);
    return () =>
      window.removeEventListener("dealflow:session-expired", onSessionExpired);
  }, [queryClient]);

  const signInMutation = useMutation({
    mutationFn: signInRequest,
    onSuccess: async (user) => {
      await clearPrivateQueryCache(queryClient);
      queryClient.setQueryData(authQueryKeys.session, user);
    },
  });
  const signUpMutation = useMutation({
    mutationFn: signUpRequest,
  });
  const signOutMutation = useMutation({
    mutationFn: signOutRequest,
    onSuccess: async () => {
      queryClient.setQueryData(authQueryKeys.session, null);
      await clearPrivateQueryCache(queryClient);
      queryClient.removeQueries({ queryKey: authQueryKeys.profile });
    },
    onError: async (error) => {
      if (normalizeAuthError(error).status === 401) {
        queryClient.setQueryData(authQueryKeys.session, null);
        await clearPrivateQueryCache(queryClient);
        queryClient.removeQueries({ queryKey: authQueryKeys.profile });
        return;
      }
      // A network failure can happen after the server has already revoked the cookie session.
      // Reconcile once through /auth/me before deciding whether to retain signed-in UI.
      try {
        const user = await restoreSession();
        queryClient.setQueryData(authQueryKeys.session, user);
        if (!user) await clearPrivateQueryCache(queryClient);
      } catch {
        // Keep the current state and let the user retry when the API is reachable.
      }
    },
  });

  const signInAsync = signInMutation.mutateAsync;
  const signUpAsync = signUpMutation.mutateAsync;
  const signOutAsync = signOutMutation.mutateAsync;
  const refetchSession = sessionQuery.refetch;
  const login = useCallback(
    (input: Parameters<typeof signInAsync>[0]) => signInAsync(input),
    [signInAsync],
  );
  const register = useCallback(
    async (input: Parameters<typeof signUpAsync>[0]) => signUpAsync(input),
    [signUpAsync],
  );
  const logout = useCallback(async () => {
    await signOutAsync();
  }, [signOutAsync]);
  const refreshSession = useCallback(async () => {
    await refetchSession();
  }, [refetchSession]);

  const value: AuthContextValue = {
    user: sessionQuery.data ?? null,
    isLoading: sessionQuery.isPending,
    initializationError: sessionQuery.error,
    isSigningIn: signInMutation.isPending,
    isSigningUp: signUpMutation.isPending,
    isSigningOut: signOutMutation.isPending,
    login,
    register,
    logout,
    refreshSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
