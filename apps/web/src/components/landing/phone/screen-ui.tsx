import type { CSSProperties, ReactNode } from "react";
import {
  HomeIcon,
  ChecklistIcon,
  ClockIcon,
  CardIcon,
} from "../icons";

export type Theme = "honey" | "onyx";
export type TabName = "Review" | "Benefits" | "Expiring" | "Cards";

const MONO = "var(--font-ibm-plex-mono)";
const SERIF = "var(--font-source-serif)";
const SANS = "var(--font-public-sans)";

export const c = {
  bg: "var(--ob-background)",
  surface: "var(--ob-surface)",
  border: "var(--ob-border)",
  sep: "var(--ob-separator)",
  ink: "var(--ob-ink)",
  sec: "var(--ob-secondary)",
  ter: "var(--ob-tertiary)",
  track: "var(--ob-track)",
  accent: "var(--ob-accent)",
  soft: "var(--ob-accent-soft)",
  warn: "var(--ob-warning)",
  warnSoft: "var(--ob-warning-soft)",
  alert: "var(--ob-alert)",
  glass: "var(--ob-glass)",
  field: "var(--ob-field)",
  segTrack: "var(--ob-segmented-track)",
} as const;

export const mono = (
  size: number,
  extra: CSSProperties = {},
): CSSProperties => ({
  fontFamily: MONO,
  fontSize: size,
  fontVariantNumeric: "tabular-nums",
  ...extra,
});

function StatusBar() {
  return (
    <div
      style={{
        height: 52,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        padding: "0 26px 6px",
        fontFamily: SANS,
        fontSize: 14,
        fontWeight: 600,
        color: c.ink,
      }}
    >
      <span>9:41</span>
      <span style={{ display: "flex", gap: 5, alignItems: "center" }}>
        <svg width="17" height="12" viewBox="0 0 17 12" fill={c.ink}>
          <rect x="0" y="7" width="3" height="5" rx="1" />
          <rect x="4.5" y="4.5" width="3" height="7.5" rx="1" />
          <rect x="9" y="2" width="3" height="10" rx="1" />
          <rect x="13.5" y="0" width="3" height="12" rx="1" opacity="0.35" />
        </svg>
        <svg width="24" height="12" viewBox="0 0 24 12" fill="none">
          <rect
            x="1"
            y="1"
            width="19"
            height="10"
            rx="3"
            stroke={c.ink}
            strokeOpacity="0.5"
          />
          <rect x="2.5" y="2.5" width="14" height="7" rx="1.5" fill={c.ink} />
          <rect
            x="21"
            y="4"
            width="1.6"
            height="4"
            rx="0.8"
            fill={c.ink}
            fillOpacity="0.5"
          />
        </svg>
      </span>
    </div>
  );
}

function TabBar({ active }: { active: TabName }) {
  const items: [TabName, typeof HomeIcon][] = [
    ["Review", HomeIcon],
    ["Benefits", ChecklistIcon],
    ["Expiring", ClockIcon],
    ["Cards", CardIcon],
  ];
  return (
    <div
      style={{
        position: "absolute",
        left: 14,
        right: 14,
        bottom: 12,
        display: "flex",
        padding: "9px 6px",
        background: c.glass,
        backdropFilter: "blur(22px) saturate(180%)",
        WebkitBackdropFilter: "blur(22px) saturate(180%)",
        borderRadius: 28,
        border: `1px solid ${c.border}`,
        boxShadow:
          "0 10px 26px rgba(0,0,0,.18), inset 0 1px 0 rgba(255,255,255,.5)",
      }}
    >
      {items.map(([name, Icon]) => {
        const on = name === active;
        return (
          <div
            key={name}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              color: on ? c.accent : c.ter,
            }}
          >
            <Icon size={22} strokeWidth={1.8} />
            <span style={{ fontSize: 10, fontWeight: 600 }}>{name}</span>
          </div>
        );
      })}
    </div>
  );
}

export function CircleButton({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        width: 34,
        height: 34,
        borderRadius: "50%",
        background: c.surface,
        border: `1px solid ${c.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontFamily: MONO,
        fontSize: 10.5,
        fontWeight: 500,
        letterSpacing: ".06em",
        textTransform: "uppercase",
        color: c.ter,
        padding: "0 6px 8px",
      }}
    >
      {children}
    </div>
  );
}

export function InsetGroup({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        background: c.surface,
        border: `1px solid ${c.border}`,
        borderRadius: 16,
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Full screen chrome: status bar, large title header, body, floating tab bar. */
export function Screen({
  theme = "honey",
  title,
  eyebrow,
  trailing,
  active,
  children,
}: {
  theme?: Theme;
  title: ReactNode;
  eyebrow?: string;
  trailing?: ReactNode;
  active: TabName;
  children: ReactNode;
}) {
  return (
    <div
      className={theme === "onyx" ? "theme-onyx" : undefined}
      style={{
        width: "100%",
        height: "100%",
        background: c.bg,
        fontFamily: SANS,
        color: c.ink,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <StatusBar />
      <div
        style={{
          padding: "4px 20px 8px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
        }}
      >
        <div>
          {eyebrow ? (
            <div
              style={{
                fontFamily: MONO,
                fontSize: 10.5,
                fontWeight: 500,
                letterSpacing: ".04em",
                color: c.ter,
              }}
            >
              {eyebrow}
            </div>
          ) : null}
          <div
            style={{
              fontFamily: SERIF,
              fontSize: 27,
              fontWeight: 600,
              letterSpacing: "-.02em",
              lineHeight: 1.05,
            }}
          >
            {title}
          </div>
        </div>
        {trailing}
      </div>
      <div
        style={{
          position: "absolute",
          top: eyebrow ? 128 : 112,
          left: 0,
          right: 0,
          bottom: 0,
          overflow: "hidden",
          padding: "6px 16px 90px",
        }}
      >
        {children}
      </div>
      <TabBar active={active} />
    </div>
  );
}
