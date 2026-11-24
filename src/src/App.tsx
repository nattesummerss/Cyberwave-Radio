import { QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "@/components/error-boundary";
import { ConfirmDialogProvider } from "@/components/confirm-dialog";
import { AppShell } from "@/components/app-shell";
import { HomePage } from "@/pages/home";
import { queryClient } from "@/lib/query-client";

export function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ConfirmDialogProvider>
          <AppShell>
            <HomePage />
          </AppShell>
        </ConfirmDialogProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
