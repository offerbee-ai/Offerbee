import { View } from "react-native";

import { Text } from "@/components/ui";
import { useTheme } from "@/theme";

/** Square countdown tile: big mono day count over a tiny "days" caption. */
export function DaysTile({ days, urgent = false, size = 44 }: { days: number; urgent?: boolean; size?: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        backgroundColor: urgent ? colors.warningSoft : colors.field,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text variant="figureS" color={urgent ? "alert" : "ink"}>
        {days}
      </Text>
      <Text variant="caption" style={{ fontSize: 9, marginTop: -2 }} color={urgent ? "alert" : "tertiary"}>
        {days === 1 ? "day" : "days"}
      </Text>
    </View>
  );
}
