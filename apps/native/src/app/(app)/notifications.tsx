import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";

// Minimal offers list — the deep-link target for tapped push notifications.
// (Full native product screens are a later phase; web is built first.)
export default function NotificationsScreen() {
  const result = useQuery(api.notifications.listNotifications, {
    paginationOpts: { numItems: 30, cursor: null },
  });
  const items = result?.page ?? [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Offers</Text>
      {result === undefined ? (
        <Text style={styles.muted}>Loading…</Text>
      ) : items.length === 0 ? (
        <Text style={styles.muted}>No offers yet.</Text>
      ) : (
        items.map((n) => (
          <View key={n._id} style={styles.card}>
            <Text style={styles.cardTitle}>{n.title}</Text>
            <Text style={styles.cardBody}>{n.body}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fbf8f0" },
  content: { padding: 20 },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#211d16",
    marginBottom: 16,
  },
  muted: { color: "#8b8271", fontSize: 15 },
  card: {
    backgroundColor: "#fffefb",
    borderColor: "#e8e1d2",
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
  },
  cardTitle: { fontSize: 16, fontWeight: "600", color: "#211d16" },
  cardBody: { fontSize: 14, color: "#5c5647", marginTop: 4 },
});
