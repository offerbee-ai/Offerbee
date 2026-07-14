"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import type { Id } from "@packages/backend/convex/_generated/dataModel";
import { Button, Card, EmptyState, Spinner } from "@/components/app/ui";
import { cn } from "@/lib/utils";

export default function OffersPage() {
  const result = useQuery(api.notifications.listNotifications, {
    paginationOpts: { numItems: 30, cursor: null },
  });
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);

  if (result === undefined)
    return (
      <div className="flex justify-center py-24">
        <Spinner />
      </div>
    );

  const notifications = result.page;

  if (notifications.length === 0)
    return (
      <EmptyState
        title="No offers yet"
        description="As you add cards, OfferBee will surface signup-bonus deadlines, benefits to use, and the best card for each category here."
      />
    );

  const onMarkRead = (id: Id<"notifications">) =>
    markRead({ notificationId: id }).catch((e) =>
      console.error("markRead failed", e),
    );

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-[28px] font-semibold text-ink">
          Alerts & Notifications
        </h1>
        <Button variant="secondary" onClick={() => markAllRead()}>
          Mark all read
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {notifications.map((n) => (
          <Card
            key={n._id}
            className={cn(
              "flex items-start justify-between gap-4",
              !n.isRead && "border-accent/40 bg-accent-soft/30",
            )}
          >
            <div className="flex items-start gap-3">
              {!n.isRead && (
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" />
              )}
              <div>
                <p className="font-semibold text-ink">{n.title}</p>
                <p className="mt-1 text-[14px] text-body">{n.body}</p>
              </div>
            </div>
            {!n.isRead && (
              <button
                onClick={() => onMarkRead(n._id)}
                className="shrink-0 text-[13px] font-semibold text-accent hover:underline"
              >
                Mark read
              </button>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
