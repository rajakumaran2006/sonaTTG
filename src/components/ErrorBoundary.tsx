import React from "react";
import { Button } from "@/components/ui/button";

type Props = { children: React.ReactNode };

type State = { hasError: boolean; error?: any };

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: any): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
    // Optionally refresh the page or navigate
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <main className="min-h-screen flex items-center justify-center p-6">
          <div className="max-w-md text-center">
            <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
            <p className="text-sm text-muted-foreground mb-4">An unexpected error occurred. Please try again.</p>
            <Button onClick={this.handleReset}>Reload</Button>
          </div>
        </main>
      );
    }

    return this.props.children as any;
  }
}
