import { type Href, Redirect } from "expo-router";

// Native product screens are a later phase; for now the authenticated home
// lands on the offers list (the push deep-link target).
export default function AppIndex() {
  return <Redirect href={"/notifications" as unknown as Href} />;
}
