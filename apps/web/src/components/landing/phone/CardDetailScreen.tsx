import {
  Screen,
  SectionLabel,
  InsetGroup,
  c,
  mono,
  type Theme,
} from "./screen-ui";

function CreditLine({
  name,
  sub,
  amount,
  last,
}: {
  name: string;
  sub: string;
  amount: string;
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
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{name}</div>
        <div style={{ fontSize: 11.5, color: c.sec }}>{sub}</div>
      </div>
      <span style={{ ...mono(12.5), fontWeight: 600, color: c.sec }}>
        {amount}
      </span>
    </div>
  );
}

export function CardDetailScreen({ theme = "onyx" }: { theme?: Theme }) {
  return (
    <Screen
      theme={theme}
      title="Amex Platinum"
      active="Cards"
      trailing={
        <div
          style={{
            color: c.ter,
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: 1,
          }}
        >
          ···
        </div>
      }
    >
      {/* Card-art hero (content colors — do not theme) */}
      <div
        style={{
          height: 120,
          borderRadius: 16,
          background: "#2B2F36",
          position: "relative",
          overflow: "hidden",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(140deg,rgba(255,255,255,.14),rgba(0,0,0,.14))",
          }}
        />
        <div
          style={{
            position: "relative",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-source-serif)",
              fontWeight: 600,
              color: "#E7E2D6",
              fontSize: 14,
            }}
          >
            PLATINUM
          </span>
          <div
            style={{
              width: 28,
              height: 21,
              borderRadius: 5,
              background: "rgba(255,255,255,.4)",
            }}
          />
        </div>
        <div style={{ position: "relative", fontSize: 11.5, color: "#C9C4B8" }}>
          $695 / yr · renews Mar 2027
        </div>
      </div>

      <div
        style={{
          background: c.surface,
          border: `1px solid ${c.border}`,
          borderRadius: 16,
          padding: "15px 16px",
          marginBottom: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span
            style={{
              ...mono(10),
              fontWeight: 500,
              letterSpacing: ".06em",
              textTransform: "uppercase",
              color: c.ter,
            }}
          >
            Captured this year
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: c.accent,
              background: c.soft,
              padding: "4px 9px",
              borderRadius: 7,
            }}
          >
            Keep
          </span>
        </div>
        <div
          style={{
            ...mono(28),
            fontWeight: 600,
            letterSpacing: "-.03em",
            marginTop: 5,
          }}
        >
          $840
        </div>
        <div
          style={{
            height: 7,
            borderRadius: 4,
            background: c.track,
            marginTop: 11,
            overflow: "hidden",
          }}
        >
          <div style={{ width: "100%", height: "100%", background: c.accent }} />
        </div>
        <div
          style={{
            fontSize: 12,
            color: c.accent,
            fontWeight: 600,
            marginTop: 7,
          }}
        >
          +$145 over the $695 fee
        </div>
      </div>

      <SectionLabel>Credits · 6</SectionLabel>
      <InsetGroup>
        <CreditLine
          name="Airline fee credit"
          sub="Annual · used"
          amount="$200/$200"
        />
        <CreditLine name="Uber Cash" sub="Monthly · $15" amount="$0/$15" last />
      </InsetGroup>
    </Screen>
  );
}
