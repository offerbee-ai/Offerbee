"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useClerk, useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { useApp, type Theme } from "../AppProvider";
import { Segmented, ToggleSwitch, MonoLabel, Panel } from "../controls";
import { CYCLE_LABEL, usd, type Credit } from "../data";

// Local (sample) toggles that don't yet have a dedicated backend field. Persist
// them so they feel real; the master switch below is the real backend flag.
const LOCAL_PREF_KEY = "offerbee-notif-prefs";
type LocalPrefs = { expiry: boolean; weekly: boolean; renewal: boolean };
const DEFAULT_LOCAL: LocalPrefs = { expiry: true, weekly: true, renewal: false };

function SettingsSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <MonoLabel className="mb-2 px-1">{label}</MonoLabel>
      {children}
    </div>
  );
}

function ToggleRow({
  title,
  desc,
  checked,
  onChange,
}: {
  title: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-separator px-5 py-4 first:border-t-0">
      <div>
        <div className="text-[14.5px] font-semibold text-ink">{title}</div>
        <div className="mt-0.5 text-[13px] text-secondary">{desc}</div>
      </div>
      <ToggleSwitch checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

function downloadCreditsCsv(credits: Credit[]) {
  const header = [
    "Credit",
    "Card",
    "Cycle",
    "Amount",
    "Used this period",
    "Remaining",
    "Resets",
  ];
  const rows = credits.map((c) => [
    c.name,
    c.card,
    CYCLE_LABEL[c.cycle],
    usd(c.amount),
    usd(Math.min(c.usedAmount, c.amount)),
    usd(Math.max(0, c.amount - c.usedAmount)),
    new Date(c.resetAt).toISOString().slice(0, 10),
  ]);
  const csv = [header, ...rows]
    .map((r) => r.map((f) => `"${f.replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "offerbee-credits.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function Settings() {
  const router = useRouter();
  const { user } = useUser();
  const { signOut, openUserProfile } = useClerk();
  const { theme, setTheme, credits } = useApp();

  const me = useQuery(api.users.getMe);
  const updatePrefs = useMutation(api.users.updateNotificationPrefs);

  // Master switch = real backend field. Derive from the query, letting a local
  // override win immediately after a click (before the query round-trips).
  const [override, setOverride] = useState<boolean | null>(null);
  const remindersOn = override ?? me?.notificationsEnabled ?? true;

  const [local, setLocal] = useState<LocalPrefs>(DEFAULT_LOCAL);
  // Load persisted local toggles after mount (default-first avoids an SSR
  // hydration mismatch; there is no server value to read).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LOCAL_PREF_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setLocal({ ...DEFAULT_LOCAL, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
  }, []);
  const setLocalPref = (patch: Partial<LocalPrefs>) => {
    setLocal((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem(LOCAL_PREF_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const toggleReminders = (v: boolean) => {
    setOverride(v);
    updatePrefs({ notificationsEnabled: v }).catch((e) =>
      console.error("updateNotificationPrefs failed", e),
    );
  };

  const name = user?.fullName ?? user?.firstName ?? "Maya Okafor";
  const email = user?.primaryEmailAddress?.emailAddress ?? "maya@example.com";
  const memberSince = user?.createdAt
    ? new Date(user.createdAt).getFullYear()
    : 2024;
  const initial = (name[0] ?? "M").toUpperCase();

  return (
    <div className="flex max-w-[720px] flex-col gap-5">
      {/* Profile */}
      <Panel className="flex flex-wrap items-center gap-4 p-5">
        <div
          className="flex size-16 shrink-0 items-center justify-center rounded-full text-[26px] font-semibold text-white"
          style={{ background: "linear-gradient(135deg,#F5B14D,#E8680E)" }}
        >
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-[22px] font-semibold text-ink">{name}</div>
          <div className="text-[13.5px] text-secondary">
            {email} · member since {memberSince}
          </div>
        </div>
        <button
          type="button"
          onClick={() => openUserProfile()}
          className="rounded-[11px] border border-border bg-surface px-4 py-2 text-[14px] font-semibold text-ink transition-colors hover:border-accent"
        >
          Edit profile
        </button>
      </Panel>

      {/* Plan */}
      <div className="rounded-[20px] bg-ink p-6 text-background">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em] opacity-70">
              Current plan
            </div>
            <div className="mt-1 font-display text-[22px] font-semibold">OfferBee Pro</div>
            <div className="mt-0.5 text-[13px] opacity-75">
              $4/mo · unlimited cards · renews Aug 2026
            </div>
          </div>
          <button
            type="button"
            onClick={() => alert("Billing management is coming soon.")}
            className="rounded-[11px] bg-accent px-4 py-2 text-[14px] font-semibold text-on-accent transition-colors hover:bg-accent-strong"
          >
            Manage billing
          </button>
        </div>
      </div>

      {/* Appearance */}
      <SettingsSection label="Appearance">
        <Panel className="flex items-center justify-between gap-4 p-5">
          <div>
            <div className="text-[14.5px] font-semibold text-ink">Theme</div>
            <div className="mt-0.5 text-[13px] text-secondary">
              Switch between Honey and Onyx.
            </div>
          </div>
          <Segmented<Theme>
            value={theme}
            onChange={setTheme}
            options={[
              { value: "honey", label: "Honey" },
              { value: "onyx", label: "Onyx" },
            ]}
          />
        </Panel>
      </SettingsSection>

      {/* Notifications */}
      <SettingsSection label="Notifications">
        <Panel className="overflow-hidden">
          <ToggleRow
            title="Smart reminders"
            desc="Nudges timed to how you actually spend."
            checked={remindersOn}
            onChange={toggleReminders}
          />
          <ToggleRow
            title="Expiry alerts"
            desc="Warn me before a credit resets."
            checked={local.expiry}
            onChange={(v) => setLocalPref({ expiry: v })}
          />
          <ToggleRow
            title="Weekly digest"
            desc="A Monday summary of unused credits."
            checked={local.weekly}
            onChange={(v) => setLocalPref({ weekly: v })}
          />
          <ToggleRow
            title="Renewal alerts"
            desc="Heads-up before an annual fee posts."
            checked={local.renewal}
            onChange={(v) => setLocalPref({ renewal: v })}
          />
        </Panel>
      </SettingsSection>

      {/* Footer actions */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => downloadCreditsCsv(credits)}
          className="rounded-[11px] border border-border bg-surface px-4 py-[11px] text-[14px] font-semibold text-secondary transition-colors hover:border-accent hover:text-ink"
        >
          Export data (CSV)
        </button>
        <button
          type="button"
          onClick={() => signOut(() => router.push("/"))}
          className="rounded-[11px] border border-border bg-surface px-4 py-[11px] text-[14px] font-semibold text-alert transition-colors hover:border-alert"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
