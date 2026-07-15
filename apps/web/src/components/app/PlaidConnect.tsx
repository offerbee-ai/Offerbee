"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { Panel } from "./controls";
import { AccountLinkPicker } from "./AccountLinkPicker";

// "Connected accounts" — Plaid Link connect + per-account → wallet-card linking.
// Links let transaction sync auto-log the card's credits.
export function PlaidConnect() {
  const configured = useQuery(api.plaid.plaidConfigured);
  const connections = useQuery(api.plaid.listConnections);
  const wallet = useQuery(api.benefits.listMyCredits);
  const createLinkToken = useAction(api.plaid.createLinkToken);
  const createUpdateLinkToken = useAction(api.plaid.createUpdateLinkToken);
  const exchange = useAction(api.plaid.exchangePublicToken);
  const reactivate = useMutation(api.plaid.reactivateItem);
  const removeConnection = useAction(api.plaid.removeConnection);

  const walletCards = (wallet?.cards ?? []).map((c) => ({
    cardKey: c.cardKey,
    name: c.name,
  }));
  const [linkToken, setLinkToken] = useState<string | null>(null);
  // Set while re-authenticating an existing item (Link update mode); null = a
  // fresh connect. onSuccess branches on this.
  const [reauthItemId, setReauthItemId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openedFor = useRef<string | null>(null);

  const onSuccess = useCallback(
    async (publicToken: string, metadata: any) => {
      setBusy(true);
      setError(null);
      try {
        if (reauthItemId) {
          // Update mode: no public-token exchange — just mark the item healthy.
          await reactivate({ itemId: reauthItemId });
        } else {
          await exchange({
            publicToken,
            institutionId: metadata?.institution?.institution_id,
            institutionName: metadata?.institution?.name,
          });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to link account");
      } finally {
        setBusy(false);
        setLinkToken(null);
        setReauthItemId(null);
        openedFor.current = null;
      }
    },
    [exchange, reactivate, reauthItemId],
  );

  // User closed Link without finishing — reset so the button leaves "Connecting…".
  const onExit = useCallback(() => {
    setBusy(false);
    setLinkToken(null);
    setReauthItemId(null);
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

  // Re-authenticate an existing connection (Link update mode).
  const startReauth = async (itemId: string) => {
    setBusy(true);
    setError(null);
    setReauthItemId(itemId);
    try {
      const { linkToken } = await createUpdateLinkToken({ itemId });
      setLinkToken(linkToken);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start reconnect");
      setBusy(false);
      setReauthItemId(null);
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
              <div
                className="mt-0.5 text-[12.5px]"
                style={{
                  color:
                    conn.status === "active"
                      ? "var(--ob-secondary)"
                      : "var(--ob-alert)",
                }}
              >
                {conn.status === "active"
                  ? `${conn.accounts.length} account${conn.accounts.length === 1 ? "" : "s"}`
                  : conn.status === "login_required"
                    ? "Reconnect needed"
                    : "Connection error"}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {conn.status !== "active" && (
                <button
                  type="button"
                  onClick={() => void startReauth(conn.itemId)}
                  disabled={busy}
                  className="rounded-[9px] bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-on-accent transition-colors hover:bg-accent-strong disabled:opacity-50"
                >
                  Reconnect
                </button>
              )}
              <button
                type="button"
                onClick={() => void removeConnection({ itemId: conn.itemId })}
                className="text-[13px] font-semibold text-alert hover:underline"
              >
                Disconnect
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-2">
            {conn.accounts.map((acct) => (
              <AccountLinkPicker
                key={acct.accountId}
                account={{
                  accountId: acct.accountId,
                  name: acct.name,
                  mask: acct.mask,
                  linkedCardName: acct.linkedCardName,
                }}
                walletCards={walletCards}
              />
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
