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
export class ErrorBoundary extends Component<
  { children: ReactNode; resetKey?: string; scope?: 'screen' | 'app' },
  State
> {
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

    // At app scope the shell itself is gone, so there is no sidebar to escape
    // to — the only honest offer is to drop the session and start clean.
    const atRoot = this.props.scope === 'app';

    return (
      <div className={atRoot ? 'mx-auto mt-24 max-w-lg px-4' : ''}>
        <div className="rounded-xl border border-destructive/40 bg-card p-6">
          <h2 className="text-base font-semibold text-destructive">
            {atRoot ? 'Shop Suite failed to start' : 'This screen failed to render'}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {atRoot
              ? 'Something went wrong before any screen could load. Signing out clears the stored session and usually fixes it.'
              : 'The rest of the app is still fine — pick another module from the sidebar, or retry.'}
          </p>
          <pre className="mt-3 max-h-40 overflow-auto rounded-md bg-muted p-3 text-xs">
            {this.state.error.message}
          </pre>
          {atRoot ? (
            <Button
              className="mt-4"
              onClick={() => {
                localStorage.clear();
                window.location.replace('/login');
              }}
            >
              Sign out and start over
            </Button>
          ) : (
            <Button className="mt-4" onClick={() => this.setState({ error: null })}>
              Retry
            </Button>
          )}
        </div>
      </div>
    );
  }
}
