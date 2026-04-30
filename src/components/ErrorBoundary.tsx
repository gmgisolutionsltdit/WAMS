import { Component, ErrorInfo, ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches render-time errors in any child subtree and shows a friendly
 * fallback instead of the dreaded blank white screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary] caught:", error, info?.componentStack);
  }

  reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-md mx-auto py-16 text-center">
          <AlertCircle className="h-10 w-10 mx-auto text-destructive mb-3" />
          <h3 className="font-semibold mb-1">{this.props.fallbackTitle || "Something went wrong"}</h3>
          <p className="text-sm text-muted-foreground mb-4 break-words">
            {this.state.error?.message || "An unexpected error occurred while rendering this page."}
          </p>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" onClick={this.reset}>
              <RefreshCw className="h-4 w-4 mr-1" /> Retry
            </Button>
            <Button onClick={() => window.location.reload()}>Reload page</Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
