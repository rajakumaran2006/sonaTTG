import React from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Home, RefreshCw, LogIn } from "lucide-react";

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
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
    window.location.reload();
  };

  handleGoDashboard = () => {
    this.setState({ hasError: false, error: undefined });
    try {
      const superAdmin = localStorage.getItem("superAdmin") === "true";
      const adminUser = localStorage.getItem("adminUser");
      const facultyUser = localStorage.getItem("facultyUser");

      if (superAdmin) {
        window.location.href = "/super-admin";
      } else if (adminUser) {
        window.location.href = "/admin";
      } else if (facultyUser) {
        window.location.href = "/faculty";
      } else {
        window.location.href = "/";
      }
    } catch {
      window.location.href = "/";
    }
  };

  handleGoLogin = () => {
    this.setState({ hasError: false, error: undefined });
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      const errorMessage = this.state.error?.message || String(this.state.error || "An unexpected error occurred");

      return (
        <main className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
          <div className="max-w-lg w-full text-center p-8 rounded-2xl border border-border bg-card shadow-lg">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mb-4">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-bold mb-2 text-foreground">Something went wrong</h1>
            <p className="text-sm text-muted-foreground mb-4">
              An unexpected error occurred while rendering this page.
            </p>

            {errorMessage && (
              <div className="text-left bg-muted/60 border border-border/80 rounded-xl p-3 mb-6 overflow-auto max-h-36">
                <p className="text-xs font-mono text-destructive break-all">{errorMessage}</p>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button onClick={this.handleReset} variant="outline" className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Reload
              </Button>
              <Button onClick={this.handleGoDashboard} className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold">
                <Home className="w-4 h-4" />
                Go to Dashboard
              </Button>
              <Button onClick={this.handleGoLogin} variant="ghost" className="gap-2 text-muted-foreground">
                <LogIn className="w-4 h-4" />
                Sign In
              </Button>
            </div>
          </div>
        </main>
      );
    }

    return this.props.children as any;
  }
}

