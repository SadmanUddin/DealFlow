import { Component } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

type ErrorBoundaryProps = { children: ReactNode };
type ErrorBoundaryState = { hasError: boolean };

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('Frontend render error', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="grid min-h-screen place-items-center bg-paper px-6">
          <div className="max-w-md text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-rose-50 text-rose-700">
              <AlertTriangle aria-hidden="true" size={21} />
            </span>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight text-ink">
              Something didn’t load as expected
            </h1>
            <p className="mt-2 text-sm leading-6 text-ink-soft">
              The page encountered an unexpected issue. You can try loading it
              again.
            </p>
            <Button className="mt-6" onClick={() => window.location.reload()}>
              <RotateCcw aria-hidden="true" size={15} />
              Reload page
            </Button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
