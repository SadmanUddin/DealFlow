import { QueryProvider } from "./app/providers/QueryProvider";
import { AppRouter } from "./app/router";
import { ErrorBoundary } from "./components/shared/ErrorBoundary";
import { AuthProvider } from "./features/auth/AuthProvider";

export function App() {
  return (
    <ErrorBoundary>
      <QueryProvider>
        <AuthProvider>
          <AppRouter />
        </AuthProvider>
      </QueryProvider>
    </ErrorBoundary>
  );
}
