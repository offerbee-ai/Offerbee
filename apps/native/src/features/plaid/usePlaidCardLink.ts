import { useRef, useState } from "react";
import Constants, { ExecutionEnvironment } from "expo-constants";
import {
  createPlaidLinkSession,
  type LinkExit,
  type LinkSuccess,
} from "react-native-plaid-link-sdk";
import { useAction } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";

// One Plaid Link round-trip (native): token → Link UI → exchange → detection
// results. Plaid's native module is absent in Expo Go — isPlaidAvailable lets
// gate/chooser hide the Connect option there (spec: auto-route to manual).
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

export const isPlaidAvailable =
  Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

export function usePlaidCardLink({
  onDetected,
  onFail,
}: {
  onDetected: (result: DetectResult) => void;
  onFail?: (reason: "error" | "exit", message?: string) => void;
}) {
  const createLinkToken = useAction(api.plaid.createLinkToken);
  const exchange = useAction(api.plaid.exchangePublicToken);
  const [busy, setBusy] = useState(false);
  // Two fast taps can both pass the `busy` state check before the rerender
  // lands — the ref guards synchronously; the state stays for UI.
  const busyRef = useRef(false);

  const startConnect = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const { linkToken } = await createLinkToken({});
      const session = await createPlaidLinkSession({
        token: linkToken,
        onSuccess: async (success: LinkSuccess) => {
          try {
            const institutionName =
              success.metadata?.institution?.name ?? undefined;
            const result = await exchange({
              publicToken: success.publicToken,
              institutionId: success.metadata?.institution?.id,
              institutionName,
            });
            onDetected(result);
          } catch (e) {
            onFail?.("error", e instanceof Error ? e.message : String(e));
          } finally {
            busyRef.current = false;
            setBusy(false);
          }
        },
        // An exit carrying a LinkError is a failure, not a user cancel —
        // mirror the web hook: error → "error", plain cancel → "exit".
        onExit: (exit: LinkExit) => {
          busyRef.current = false;
          setBusy(false);
          onFail?.(
            exit.error ? "error" : "exit",
            exit.error
              ? exit.error.displayMessage || exit.error.errorMessage || undefined
              : undefined,
          );
        },
        onEvent: () => {},
      });
      await session.open();
    } catch (e) {
      busyRef.current = false;
      setBusy(false);
      onFail?.("error", e instanceof Error ? e.message : String(e));
    }
  };

  return { startConnect, busy };
}
