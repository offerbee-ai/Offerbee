"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { useAction } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";

// One Plaid Link round-trip: token → Link UI → public-token exchange →
// detection results. Callers render the review screen from `onDetected`;
// `onFail` fires on any error or user exit so callers can fall back to the
// manual path (spec rule: never a dead end).
export type DetectedAccount = {
  accountId: string;
  mask?: string;
  name?: string;
  officialName?: string;
  subtype?: string;
  resolvedCardKey: string | null;
};

export type DetectResult = {
  itemId: string;
  institutionName?: string;
  accounts: DetectedAccount[];
};

export function usePlaidCardLink({
  onDetected,
  onFail,
}: {
  onDetected: (result: DetectResult) => void;
  onFail?: (reason: "error" | "exit", message?: string) => void;
}) {
  const createLinkToken = useAction(api.plaid.createLinkToken);
  const exchange = useAction(api.plaid.exchangePublicToken);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const openedFor = useRef<string | null>(null);

  const onSuccess = useCallback(
    async (publicToken: string, metadata: any) => {
      try {
        const institutionName = metadata?.institution?.name as
          | string
          | undefined;
        const result = await exchange({
          publicToken,
          institutionId: metadata?.institution?.institution_id,
          institutionName,
        });
        onDetected(result);
      } catch (e) {
        onFail?.("error", e instanceof Error ? e.message : "Failed to connect");
      } finally {
        setBusy(false);
        setLinkToken(null);
        openedFor.current = null;
      }
    },
    [exchange, onDetected, onFail],
  );

  const onExit = useCallback(() => {
    setBusy(false);
    setLinkToken(null);
    openedFor.current = null;
    onFail?.("exit");
  }, [onFail]);

  const { open, ready } = usePlaidLink({ token: linkToken, onSuccess, onExit });

  // usePlaidLink needs the token up front, so fetch it, then auto-open once ready.
  useEffect(() => {
    if (linkToken && ready && openedFor.current !== linkToken) {
      openedFor.current = linkToken;
      open();
    }
  }, [linkToken, ready, open]);

  const startConnect = useCallback(async () => {
    setBusy(true);
    try {
      const { linkToken } = await createLinkToken({});
      setLinkToken(linkToken);
    } catch (e) {
      setBusy(false);
      onFail?.(
        "error",
        e instanceof Error ? e.message : "Failed to start Plaid",
      );
    }
  }, [createLinkToken, onFail]);

  return { startConnect, busy };
}
