import {
  Screen,
  CircleButton,
  SectionLabel,
  InsetGroup,
  c,
  mono,
  type Theme,
} from "./screen-ui";
import { PlusIcon } from "../icons";

function WalletRow({
  art,
  name,
  sub,
  net,
  pos,
  verdict,
  last,
}: {
  art: string;
  name: string;
  sub: string;
  net: string;
  pos: boolean;
  verdict: string;
  last?: boolean;
}) {
  const col = pos ? c.accent : c.warn;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "13px 15px",
        borderBottom: last ? undefined : `1px solid ${c.sep}`,
      }}
    >
      <div
        style={{ width: 34, height: 23, borderRadius: 5, background: art }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{name}</div>
        <div style={{ fontSize: 11.5, color: c.sec }}>{sub}</div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ ...mono(13.5), fontWeight: 600, color: col }}>{net}</div>
        <div style={{ fontSize: 10.5, fontWeight: 600, color: col }}>
          {verdict}
        </div>
      </div>
    </div>
  );
}

export function CardsScreen({ theme = "honey" }: { theme?: Theme }) {
  return (
    <Screen
      theme={theme}
      title="Cards"
      active="Cards"
      trailing={
        <CircleButton>
          <PlusIcon size={16} style={{ color: c.accent }} />
        </CircleButton>
      }
    >
      <div
        style={{
          background: c.surface,
          border: `1px solid ${c.border}`,
          borderRadius: 18,
          padding: "16px 17px",
          marginBottom: 14,
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
          Net across 4 cards
        </div>
        <div
          style={{
            ...mono(32),
            fontWeight: 600,
            letterSpacing: "-.03em",
            color: c.accent,
            marginTop: 4,
          }}
        >
          +$330
        </div>
        <div style={{ fontSize: 12, color: c.sec, marginTop: 2 }}>
          $2,050 captured · $1,720 in fees
        </div>
      </div>

      <SectionLabel>Your wallet</SectionLabel>
      <InsetGroup>
        <WalletRow
          art="#3A4048"
          name="Amex Platinum"
          sub="$695 fee · $840 captured"
          net="+$145"
          pos
          verdict="Keep"
        />
        <WalletRow
          art="#B08A3E"
          name="Amex Gold"
          sub="$325 fee · $410 captured"
          net="+$85"
          pos
          verdict="Keep"
        />
        <WalletRow
          art="#1E6FB8"
          name="Sapphire Reserve"
          sub="$550 fee · $600 captured"
          net="+$50"
          pos
          verdict="Keep"
        />
        <WalletRow
          art="#7A2E3B"
          name="Hilton Aspire"
          sub="$550 fee · $500 captured"
          net="−$50"
          pos={false}
          verdict="Review"
          last
        />
      </InsetGroup>
    </Screen>
  );
}
