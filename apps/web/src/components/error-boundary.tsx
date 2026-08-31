import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './ui/button';

interface State {
  error: Error | null;
}

/**
 * Without this, a single thrown render error unmounts the entire SPA and every
 * screen looks broken — which is exactly how one bad page hid behind "transfers
 * and movements aren't working". Keyed by route, so navigating away recovers.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Screen crashed:', error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="mx-auto max-w-lg rounded-xl border border-destructive/40 bg-card p-6">
        <h2 className="text-base font-semibold text-destructive">This screen failed to render</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The rest of the app is still fine — pick another module from the sidebar, or retry.
        </p>
        <pre className="mt-3 max-h-40 overflow-auto rounded-md bg-muted p-3 text-xs">
          {this.state.error.message}
        </pre>
        <Button className="mt-4" onClick={() => this.setState({ error: null })}>
          Retry
        </Button>
      </div>
    );
  }
}
