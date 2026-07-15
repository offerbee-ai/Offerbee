"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  usePlaidLink,
  type PlaidLinkError,
  type PlaidLinkOnSuccessMetadata,
} from "react-plaid-link";
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
    async (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => {
      try {
        const institutionName = metadata.institution?.name;
        const result = await exchange({
          publicToken,
          institutionId: metadata.institution?.institution_id,
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

  // Link closed — an exit with a PlaidLinkError is a failure, not a user
  // cancel, so surface the message instead of swallowing it.
  const onExit = useCallback(
    (err: null | PlaidLinkError) => {
      setBusy(false);
      setLinkToken(null);
      openedFor.current = null;
      if (err) {
        onFail?.(
          "error",
          err.display_message || err.error_message || undefined,
        );
      } else {
        onFail?.("exit");
      }
    },
    [onFail],
  );

  const { open, ready, error } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit,
  });

  // usePlaidLink needs the token up front, so fetch it, then auto-open once ready.
  useEffect(() => {
    if (linkToken && ready && openedFor.current !== linkToken) {
      openedFor.current = linkToken;
      open();
    }
  }, [linkToken, ready, open]);

  // Script-load failure: `ready` never turns true and onExit never fires, so
  // without this `busy` would be stuck. Resetting linkToken keeps the effect
  // from firing twice for the same failure.
  useEffect(() => {
    if (error && linkToken) {
      /* eslint-disable react-hooks/set-state-in-effect -- reset Link state when the Plaid script fails to load (external-system error, no callback fires) */
      setBusy(false);
      setLinkToken(null);
      /* eslint-enable react-hooks/set-state-in-effect */
      openedFor.current = null;
      onFail?.("error", error.message || "Failed to load Plaid");
    }
  }, [error, linkToken, onFail]);

  const startConnect = useCallback(async () => {
    if (busy) return;
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
  }, [busy, createLinkToken, onFail]);

  return { startConnect, busy };
}
