import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[nerv] render error', error, info);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="widget__error">
          描画エラー: {this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}
