import { QueryProvider } from './app/providers/QueryProvider';
import { AppRouter } from './app/router';
import { ErrorBoundary } from './components/shared/ErrorBoundary';

export function App() {
  return (
    <ErrorBoundary>
      <QueryProvider>
        <AppRouter />
      </QueryProvider>
    </ErrorBoundary>
  );
}
