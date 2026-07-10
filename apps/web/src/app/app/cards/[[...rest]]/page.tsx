import { redirect } from "next/navigation";

// The prototype /app/cards surface merged into /app/wallet — keep old links alive.
export default function CardsRedirect() {
  redirect("/app/wallet");
}
