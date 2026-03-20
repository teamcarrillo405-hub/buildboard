/**
 * React Error Boundary — catches render errors
 */
import React, { Component } from 'react';
import { Link } from 'react-router-dom';

interface Props { children: React.ReactNode; }
interface State { hasError: boolean; error: Error | null; }

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center px-[4%]">
          <div className="max-w-lg w-full text-center py-20">
            <div className="w-12 h-1 bg-[#F5C518] mx-auto mb-6" />
            <h1 className="font-display text-[1.8rem] font-bold uppercase tracking-[0.05em] text-white mb-3">
              Something Went Wrong
            </h1>
            <p className="text-[#999999] text-[0.9rem] mb-6">
              An unexpected error occurred. Please try refreshing the page.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-3 rounded-lg bg-[#F5C518] text-[#0A0A0A] font-display text-[0.85rem] font-bold uppercase tracking-[0.08em] hover:bg-[#D4A017] transition-colors"
              >
                Refresh Page
              </button>
              <Link
                to="/"
                onClick={() => this.setState({ hasError: false, error: null })}
                className="px-6 py-3 rounded-lg border-2 border-white/20 text-white hover:border-[#F5C518]/40 hover:text-[#F5C518] font-display text-[0.85rem] font-bold uppercase tracking-[0.08em] transition-colors"
              >
                Go Home
              </Link>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
