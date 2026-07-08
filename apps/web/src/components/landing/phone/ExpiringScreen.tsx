import {
  Screen,
  CircleButton,
  SectionLabel,
  InsetGroup,
  c,
  mono,
  type Theme,
} from "./screen-ui";
import { BellIcon } from "../icons";

function CountdownTile({
  n,
  color,
  bg,
}: {
  n: string;
  color: string;
  bg: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: 42,
        height: 42,
        borderRadius: 11,
        background: bg,
        color,
        flexShrink: 0,
      }}
    >
      <span style={{ ...mono(15), fontWeight: 600, lineHeight: 1 }}>{n}</span>
      <span style={{ fontSize: 8.5, fontWeight: 600 }}>days</span>
    </div>
  );
}

function ExpRow({
  tile,
  name,
  sub,
  action,
  last,
}: {
  tile: React.ReactNode;
  name: string;
  sub: string;
  action: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 14px",
        borderBottom: last ? undefined : `1px solid ${c.sep}`,
      }}
    >
      {tile}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{name}</div>
        <div style={{ fontSize: 11.5, color: c.sec }}>{sub}</div>
      </div>
      {action}
    </div>
  );
}

const useBtn = (
  <span style={{ fontSize: 13, fontWeight: 600, color: c.accent }}>Use</span>
);
const snoozeBtn = (
  <span
    style={{
      fontSize: 12,
      fontWeight: 600,
      color: c.sec,
      border: `1px solid ${c.border}`,
      padding: "5px 10px",
      borderRadius: 8,
    }}
  >
    Snooze
  </span>
);

export function ExpiringScreen({ theme = "honey" }: { theme?: Theme }) {
  return (
    <Screen
      theme={theme}
      title="Expiring"
      active="Expiring"
      trailing={
        <CircleButton>
          <BellIcon size={16} style={{ color: c.ink }} />
        </CircleButton>
      }
    >
      <div
        style={{
          display: "flex",
          background: c.segTrack,
          borderRadius: 10,
          padding: 2,
          fontSize: 12.5,
          marginBottom: 14,
        }}
      >
        <div
          style={{
            flex: 1,
            textAlign: "center",
            padding: 6,
            borderRadius: 8,
            background: c.surface,
            boxShadow: "0 1px 3px rgba(33,29,22,.14)",
            fontWeight: 600,
          }}
        >
          This week
        </div>
        <div
          style={{
            flex: 1,
            textAlign: "center",
            padding: 6,
            color: c.sec,
            fontWeight: 500,
          }}
        >
          This month
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          padding: "0 6px 8px",
        }}
      >
        <span
          style={{
            ...mono(10.5),
            fontWeight: 500,
            letterSpacing: ".06em",
            textTransform: "uppercase",
            color: c.alert,
          }}
        >
          This week
        </span>
        <span style={{ ...mono(10.5), fontWeight: 600, color: c.alert }}>
          $40 at risk
        </span>
      </div>
      <InsetGroup style={{ marginBottom: 16 }}>
        <ExpRow
          tile={<CountdownTile n="2" color={c.warn} bg={c.warnSoft} />}
          name="Dining credit"
          sub="Amex Gold · $10"
          action={useBtn}
        />
        <ExpRow
          tile={<CountdownTile n="5" color={c.warn} bg={c.warnSoft} />}
          name="Airline fee credit"
          sub="Amex Platinum · $30"
          action={useBtn}
          last
        />
      </InsetGroup>

      <SectionLabel>Later this month</SectionLabel>
      <InsetGroup>
        <ExpRow
          tile={<CountdownTile n="14" color={c.sec} bg={c.field} />}
          name="Streaming credit"
          sub="Amex Platinum · $20"
          action={snoozeBtn}
        />
        <ExpRow
          tile={<CountdownTile n="23" color={c.sec} bg={c.field} />}
          name="Lyft credit"
          sub="Chase Sapphire · $15"
          action={snoozeBtn}
          last
        />
      </InsetGroup>
    </Screen>
  );
}
