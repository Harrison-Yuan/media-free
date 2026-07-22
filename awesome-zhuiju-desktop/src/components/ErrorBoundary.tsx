import { Component, type ReactNode, type ErrorInfo } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div
          className="h-screen w-screen flex flex-col items-center justify-center gap-5 px-8"
          style={{ background: "var(--background)" }}
        >
          <div
            className="w-[60px] h-[60px] rounded-2xl flex items-center justify-center"
            style={{ background: "var(--destructive-bg)" }}
          >
            <svg
              className="w-7 h-7"
              style={{ color: "var(--destructive)" }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
          <p
            className="text-[17px] font-semibold"
            style={{ color: "var(--foreground)" }}
          >
            应用出现异常
          </p>
          <p
            className="text-[15px] max-w-sm text-center"
            style={{ color: "var(--text-tertiary)" }}
          >
            {this.state.error?.message}
          </p>
          <Button
            variant="default"
            size="lg"
            className="mt-2 rounded-xl px-8 h-11 text-[15px]"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
          >
            重新加载
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
