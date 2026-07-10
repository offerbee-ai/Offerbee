"use client";

import { useParams } from "next/navigation";
import { CardDetail } from "@/components/app/views/CardDetail";

export default function CardDetailPage() {
  const params = useParams<{ cardId: string }>();
  return <CardDetail cardId={decodeURIComponent(params.cardId)} />;
}
