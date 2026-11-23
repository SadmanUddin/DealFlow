import { QueryProvider } from "./app/providers/QueryProvider";
import { AppRouter } from "./app/router";
import { ErrorBoundary } from "./components/shared/ErrorBoundary";
import { AuthProvider } from "./features/auth/AuthProvider";

import { ComparisonProvider } from "./features/marketplace/ComparisonProvider";

export function App() {
  return (
    <ErrorBoundary>
      <QueryProvider>
        <AuthProvider>
          <ComparisonProvider>
            <AppRouter />
          </ComparisonProvider>
        </AuthProvider>
      </QueryProvider>
    </ErrorBoundary>
  );
}
