"use client";

/**
 * Step 01 — the post-signup name confirm. Email-only signups reach OfferBee
 * with no Clerk name, so we capture first/last here (prefilled from Clerk when
 * a provider supplied it). The wizard footer's Continue and Enter both submit.
 */
export function StepName({
  firstName,
  lastName,
  onFirstName,
  onLastName,
  onSubmit,
}: {
  firstName: string;
  lastName: string;
  onFirstName: (v: string) => void;
  onLastName: (v: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="max-w-[560px]">
      <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.07em] text-tertiary">
        Step 01 · You
      </div>
      <h1 className="mt-[10px] font-display text-[26px] font-semibold tracking-[-0.02em] lg:text-[32px]">
        What should we call you?
      </h1>
      <p className="mb-6 mt-[10px] text-[15px] leading-[1.5] text-secondary">
        We use your name on your dashboard and in reminders. You can change it
        anytime in Settings.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="flex max-w-[380px] flex-col gap-4"
      >
        <label className="flex flex-col gap-[7px]">
          <span className="text-[13px] font-semibold text-secondary">
            First name
          </span>
          <input
            type="text"
            value={firstName}
            onChange={(e) => onFirstName(e.target.value)}
            autoComplete="given-name"
            autoFocus
            placeholder="Jordan"
            className="w-full rounded-[11px] border border-border bg-surface px-[15px] py-[11px] text-[15px] text-ink outline-none transition-colors placeholder:text-tertiary focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-[7px]">
          <span className="text-[13px] font-semibold text-secondary">
            Last name{" "}
            <span className="font-normal text-tertiary">(optional)</span>
          </span>
          <input
            type="text"
            value={lastName}
            onChange={(e) => onLastName(e.target.value)}
            autoComplete="family-name"
            placeholder="Rivera"
            className="w-full rounded-[11px] border border-border bg-surface px-[15px] py-[11px] text-[15px] text-ink outline-none transition-colors placeholder:text-tertiary focus:border-accent"
          />
        </label>
        {/* Enter submits; the wizard footer's Continue calls the same onSubmit. */}
        <button type="submit" className="sr-only">
          Continue
        </button>
      </form>
    </div>
  );
}
