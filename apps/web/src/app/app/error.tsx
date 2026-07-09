"use client";

import { EmptyState, Button } from "@/components/app/ui";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <EmptyState
      title="Something went wrong"
      description={error.message || "An unexpected error occurred."}
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
