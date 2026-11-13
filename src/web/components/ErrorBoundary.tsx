import { Component, type ErrorInfo, type ReactNode } from 'react';

// Catches an error thrown while rendering any component below it, and shows a
// fallback screen instead of a blank page. It does not catch a failed request
// (TanStack Query hands that to the page, which shows ErrorMessage), nor
// errors in event handlers or other async code: React only routes render and
// lifecycle errors to a boundary.
type State = { crashed: boolean };

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { crashed: false };

  static getDerivedStateFromError(): State {
    return { crashed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(
      'The app crashed while rendering',
      error,
      info.componentStack,
    );
  }

  override render(): ReactNode {
    if (this.state.crashed) return <CrashScreen />;
    return this.props.children;
  }
}

function CrashScreen() {
  return (
    <main className="page">
      <div className="card crash-screen">
        <h1>Something went wrong.</h1>
        <p>Reload the page.</p>
        <button type="button" onClick={() => window.location.reload()}>
          Reload the page
        </button>
      </div>
    </main>
  );
}
