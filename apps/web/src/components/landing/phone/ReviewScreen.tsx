import {
  Screen,
  CircleButton,
  SectionLabel,
  InsetGroup,
  c,
  mono,
  type Theme,
} from "./screen-ui";
import { PlusIcon, CardIcon, ClockIcon } from "../icons";

const rowBase: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "13px 15px",
};

function IconChip({
  bg,
  color,
  children,
}: {
  bg: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        width: 30,
        height: 30,
        borderRadius: 9,
        background: bg,
        color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </div>
  );
}

export function ReviewScreen({ theme = "honey" }: { theme?: Theme }) {
  return (
    <Screen
      theme={theme}
      title="Review"
      eyebrow="Wednesday, July 8"
      active="Review"
      trailing={
        <CircleButton>
          <PlusIcon size={16} style={{ color: c.accent }} />
        </CircleButton>
      }
    >
      {/* Hero surface card */}
      <div
        style={{
          background: c.surface,
          border: `1px solid ${c.border}`,
          borderRadius: 18,
          padding: "16px 17px",
        }}
      >
        <div
          style={{
            ...mono(10),
            fontWeight: 500,
            letterSpacing: ".06em",
            textTransform: "uppercase",
            color: c.ter,
          }}
        >
          Captured value · 2026
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 9,
            marginTop: 5,
          }}
        >
          <span style={{ ...mono(34), fontWeight: 600, letterSpacing: "-.03em" }}>
            $2,050
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: c.accent }}>
            +$330
          </span>
        </div>
        <div style={{ fontSize: 12, color: c.sec, marginTop: 2 }}>
          across 4 cards · beating $1,720 in fees
        </div>
        <div
          style={{
            height: 8,
            borderRadius: 5,
            background: c.track,
            marginTop: 13,
            overflow: "hidden",
          }}
        >
          <div
            style={{ width: "84%", height: "100%", background: c.accent }}
          />
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 7,
            ...mono(10.5),
            color: c.ter,
          }}
        >
          <span>84% captured</span>
          <span>$2,435 total</span>
        </div>
      </div>

      <div style={{ height: 16 }} />
      <SectionLabel>At a glance</SectionLabel>
      <InsetGroup style={{ marginBottom: 14 }}>
        <div style={{ ...rowBase, borderBottom: `1px solid ${c.sep}` }}>
          <IconChip bg={c.soft} color={c.accent}>
            <CardIcon size={16} />
          </IconChip>
          <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>
            Remaining this month
          </div>
          <span style={{ ...mono(14), fontWeight: 600 }}>$285</span>
        </div>
        <div style={rowBase}>
          <IconChip bg={c.warnSoft} color={c.warn}>
            <ClockIcon size={16} />
          </IconChip>
          <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>
            Expiring in ≤3 days
          </div>
          <span style={{ ...mono(14), fontWeight: 600, color: c.warn }}>$40</span>
        </div>
      </InsetGroup>

      <SectionLabel>Use before they reset</SectionLabel>
      <InsetGroup>
        <UseRow art="#B08A3E" name="Dining credit" sub="Amex Gold · $10" />
        <UseRow art="#3A4048" name="Uber Cash" sub="Amex Platinum · $15" last />
      </InsetGroup>
    </Screen>
  );
}

function UseRow({
  art,
  name,
  sub,
  last,
}: {
  art: string;
  name: string;
  sub: string;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 15px",
        borderBottom: last ? undefined : `1px solid ${c.sep}`,
      }}
    >
      <div
        style={{ width: 30, height: 20, borderRadius: 5, background: art }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{name}</div>
        <div style={{ fontSize: 11.5, color: c.sec }}>{sub}</div>
      </div>
      <span style={{ fontSize: 13, fontWeight: 600, color: c.accent }}>Use</span>
    </div>
  );
}
