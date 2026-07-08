import {
  Screen,
  CircleButton,
  SectionLabel,
  InsetGroup,
  c,
  type Theme,
} from "./screen-ui";
import { FilterIcon, SearchIcon } from "../icons";

function CreditRow({
  art,
  name,
  sub,
  used,
  warn,
  last,
}: {
  art: string;
  name: string;
  sub: string;
  used?: boolean;
  warn?: boolean;
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
        <div style={{ fontSize: 11.5, color: warn ? c.warn : c.sec }}>{sub}</div>
      </div>
      {used ? (
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: c.accent,
            background: c.soft,
            padding: "5px 9px",
            borderRadius: 8,
          }}
        >
          Used ✓
        </span>
      ) : (
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: "#fff",
            background: c.accent,
            padding: "5px 10px",
            borderRadius: 8,
          }}
        >
          Mark used
        </span>
      )}
    </div>
  );
}

function Segmented({ options }: { options: string[] }) {
  return (
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
      {options.map((opt, i) => (
        <div
          key={opt}
          style={{
            flex: 1,
            textAlign: "center",
            padding: 6,
            borderRadius: 8,
            background: i === 0 ? c.surface : undefined,
            boxShadow: i === 0 ? "0 1px 3px rgba(33,29,22,.14)" : undefined,
            color: i === 0 ? c.ink : c.sec,
            fontWeight: i === 0 ? 600 : 500,
          }}
        >
          {opt}
        </div>
      ))}
    </div>
  );
}

export function BenefitsScreen({ theme = "honey" }: { theme?: Theme }) {
  return (
    <Screen
      theme={theme}
      title="Benefits"
      active="Benefits"
      trailing={
        <CircleButton>
          <FilterIcon size={16} style={{ color: c.ink }} />
        </CircleButton>
      }
    >
      <div
        style={{
          background: c.surface,
          border: `1px solid ${c.border}`,
          borderRadius: 12,
          padding: "10px 13px",
          display: "flex",
          alignItems: "center",
          gap: 9,
          marginBottom: 12,
        }}
      >
        <SearchIcon size={16} style={{ color: c.ter }} />
        <span style={{ fontSize: 13.5, color: c.ter }}>Search credits</span>
      </div>

      <Segmented options={["Monthly", "Quarterly", "Annual"]} />

      <SectionLabel>Monthly credits · 5</SectionLabel>
      <InsetGroup>
        <CreditRow
          art="#B08A3E"
          name="Dining credit"
          sub="Amex Gold · $10 · resets 3d"
          warn
        />
        <CreditRow art="#3A4048" name="Uber Cash" sub="Amex Platinum · $15" used />
        <CreditRow art="#1E6FB8" name="Travel credit" sub="Sapphire · $25" />
        <CreditRow
          art="#0B6E4F"
          name="Streaming"
          sub="Amex Platinum · $20"
          used
          last
        />
      </InsetGroup>

      <div style={{ fontSize: 11.5, color: c.ter, padding: "9px 6px 0" }}>
        $100 still available across 3 credits.
      </div>
    </Screen>
  );
}
