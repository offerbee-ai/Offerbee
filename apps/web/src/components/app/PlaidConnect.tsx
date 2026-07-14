"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import type { Id } from "@packages/backend/convex/_generated/dataModel";
import { Panel } from "./controls";

// "Connected accounts" — Plaid Link connect + per-account → wallet-card linking.
// Links let transaction sync auto-log the card's credits.
export function PlaidConnect() {
  const configured = useQuery(api.plaid.plaidConfigured);
  const connections = useQuery(api.plaid.listConnections);
  const wallet = useQuery(api.benefits.listMyCredits);
  const createLinkToken = useAction(api.plaid.createLinkToken);
  const exchange = useAction(api.plaid.exchangePublicToken);
  const linkAccount = useMutation(api.plaid.linkAccountToCard);
  const removeConnection = useAction(api.plaid.removeConnection);

  const cards = wallet?.cards ?? [];
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openedFor = useRef<string | null>(null);

  const onSuccess = useCallback(
    async (publicToken: string, metadata: any) => {
      setBusy(true);
      setError(null);
      try {
        await exchange({
          publicToken,
          institutionId: metadata?.institution?.institution_id,
          institutionName: metadata?.institution?.name,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to link account");
      } finally {
        setBusy(false);
        setLinkToken(null);
        openedFor.current = null;
      }
    },
    [exchange],
  );

  // User closed Link without finishing — reset so the button leaves "Connecting…".
  const onExit = useCallback(() => {
    setBusy(false);
    setLinkToken(null);
    openedFor.current = null;
  }, []);

  const { open, ready } = usePlaidLink({ token: linkToken, onSuccess, onExit });

  // usePlaidLink needs the token up front, so fetch it, then auto-open once ready.
  useEffect(() => {
    if (linkToken && ready && openedFor.current !== linkToken) {
      openedFor.current = linkToken;
      open();
    }
  }, [linkToken, ready, open]);

  const startConnect = async () => {
    setBusy(true);
    setError(null);
    try {
      const { linkToken } = await createLinkToken({});
      setLinkToken(linkToken);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start Plaid");
      setBusy(false);
    }
  };

  if (configured === false)
    return (
      <Panel className="p-5">
        <p className="text-[13.5px] text-secondary">
          Bank connections aren&apos;t configured yet. Set the Plaid API keys to
          enable automatic credit tracking.
        </p>
      </Panel>
    );

  return (
    <Panel className="overflow-hidden">
      {(connections ?? []).map((conn) => (
        <div key={conn.itemId} className="border-t border-separator p-5 first:border-t-0">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[14.5px] font-semibold text-ink">
                {conn.institutionName}
              </div>
              <div className="mt-0.5 text-[12.5px] text-secondary">
                {conn.status === "active"
                  ? `${conn.accounts.length} account${conn.accounts.length === 1 ? "" : "s"}`
                  : conn.status === "login_required"
                    ? "Reconnect needed"
                    : "Connection error"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void removeConnection({ itemId: conn.itemId })}
              className="text-[13px] font-semibold text-alert hover:underline"
            >
              Disconnect
            </button>
          </div>

          <div className="mt-3 flex flex-col gap-2">
            {conn.accounts.map((acct) => (
              <div
                key={acct.accountId}
                className="flex items-center justify-between gap-3 rounded-[10px] border border-border px-3 py-2"
              >
                <div className="min-w-0 text-[13.5px] text-ink">
                  {acct.name}
                  {acct.mask ? (
                    <span className="text-tertiary"> ····{acct.mask}</span>
                  ) : null}
                </div>
                <select
                  value={acct.userCardId ?? ""}
                  onChange={(e) =>
                    void linkAccount({
                      accountId: acct.accountId,
                      userCardId: e.target.value
                        ? (e.target.value as Id<"userCards">)
                        : null,
                    })
                  }
                  className="rounded-[8px] border border-border bg-surface px-2 py-1.5 text-[13px] text-ink outline-none focus:border-accent"
                >
                  <option value="">Not linked</option>
                  {cards.map((c) => (
                    <option key={c.userCardId} value={c.userCardId}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="border-t border-separator p-5 first:border-t-0">
        <button
          type="button"
          onClick={startConnect}
          disabled={busy}
          className="rounded-[11px] bg-accent px-4 py-2 text-[14px] font-semibold text-on-accent transition-colors hover:bg-accent-strong disabled:opacity-50"
        >
          {busy ? "Connecting…" : "+ Connect a card"}
        </button>
        {error && <p className="mt-2 text-[13px] font-medium text-alert">{error}</p>}
        <p className="mt-2 text-[12.5px] text-secondary">
          Link a card so OfferBee can auto-track its statement credits from your
          transactions.
        </p>
      </div>
    </Panel>
  );
}
