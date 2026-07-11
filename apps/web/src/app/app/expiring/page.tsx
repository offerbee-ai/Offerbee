import { redirect } from "next/navigation";

// Expiring folded into Benefits — keep old links (and the deployed nav) alive.
export default function ExpiringPage() {
  redirect("/app/benefits");
}
