import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { ArrowLeft, Bell, CheckCheck, ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { fetchProfile, isManager, type Profile } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/notifications/$id")({
  component: NotificationMessagePage,
});

type NotificationRow = {
  id: string;
  business_id: string | null;
  user_id: string;
  type: string;
  message: string;
  related_id: string | null;
  is_read: boolean;
  dismissed_at: string | null;
  deleted_at: string | null;
  created_at: string;
};

function NotificationMessagePage() {
  const { id } = Route.useParams() as { id: string };
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [notification, setNotification] = useState<NotificationRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchProfile().then(setProfile);
  }, []);

  const loadNotification = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("notifications")
      .select(
        "id, business_id, user_id, type, message, related_id, is_read, dismissed_at, deleted_at, created_at",
      )
      .eq("id", id)
      .eq("user_id", profile.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      toast.error("Failed to load notification: " + error.message);
      setNotification(null);
      setLoading(false);
      return;
    }

    const row = (data as NotificationRow | null) ?? null;
    setNotification(row);
    setLoading(false);

    if (row && !row.is_read) {
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", row.id)
        .eq("user_id", profile.id)
        .is("deleted_at", null);
      setNotification({ ...row, is_read: true });
    }
  }, [id, profile?.id]);

  useEffect(() => {
    loadNotification();
  }, [loadNotification]);

  useEffect(() => {
    if (!profile?.id) return;
    const channel = supabase
      .channel(`notification-detail:${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${profile.id}`,
        },
        (payload) => {
          if ((payload.new as { id?: string }).id === id) {
            const next = payload.new as NotificationRow;
            setNotification(next.deleted_at ? null : next);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, profile?.id]);

  const relatedTarget = useMemo(
    () => (notification && profile ? getRelatedTarget(notification, profile) : null),
    [notification, profile],
  );

  const markUnread = async () => {
    if (!notification || !profile) return;
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: false, dismissed_at: null })
      .eq("id", notification.id)
      .eq("user_id", profile.id)
      .is("deleted_at", null);
    if (error) {
      toast.error("Failed to mark as unread: " + error.message);
      return;
    }
    setNotification({ ...notification, is_read: false, dismissed_at: null });
    toast.success("Marked as unread");
  };

  const deleteNotification = async () => {
    if (!notification || !profile) return;
    setDeleting(true);
    const deletedAt = new Date().toISOString();
    const { error } = await supabase
      .from("notifications")
      .update({ deleted_at: deletedAt, dismissed_at: deletedAt, is_read: true })
      .eq("id", notification.id)
      .eq("user_id", profile.id);
    setDeleting(false);
    if (error) {
      toast.error("Failed to delete notification: " + error.message);
      return;
    }
    toast.success("Notification deleted");
    navigate({ to: "/notifications" });
  };

  if (!profile || loading) {
    return (
      <div className="rounded-2xl border bg-card p-8 text-sm text-muted-foreground shadow-sm">
        Loading notification...
      </div>
    );
  }

  if (!notification) {
    return (
      <div className="space-y-5">
        <Button variant="ghost" asChild className="w-fit px-0 text-[var(--navy)]">
          <Link to="/dashboard">
            <ArrowLeft className="size-4" />
            Back to dashboard
          </Link>
        </Button>
        <section className="rounded-2xl border bg-card p-8 text-center shadow-sm">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-secondary text-[var(--navy)]">
            <Bell className="size-5" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-[var(--navy)]">Notification not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This notification may have been cleared or is no longer available.
          </p>
          <Button asChild className="mt-5 bg-[var(--navy)] text-white hover:bg-[var(--navy-light)]">
            <Link to="/notifications">Open notification history</Link>
          </Button>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" asChild className="w-fit px-0 text-[var(--navy)]">
        <Link to="/dashboard">
          <ArrowLeft className="size-4" />
          Back to dashboard
        </Link>
      </Button>
      <Button variant="ghost" asChild className="ml-3 w-fit px-0 text-[var(--navy)]">
        <Link to="/notifications">All notifications</Link>
      </Button>

      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-col gap-4 border-b bg-secondary/40 p-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--navy)] text-white">
              <Bell className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-muted-foreground">Notification message</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--navy)]">
                {notificationTypeLabel(notification.type)}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge variant={notification.is_read ? "secondary" : "default"}>
                  {notification.is_read ? "Read" : "Unread"}
                </Badge>
                <Badge variant="outline">{notification.type.replaceAll("_", " ")}</Badge>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={markUnread} disabled={!notification.is_read}>
              <CheckCheck className="size-4" />
              Mark unread
            </Button>
            <Button
              variant="outline"
              onClick={deleteNotification}
              disabled={deleting}
              className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
          </div>
        </div>

        <div className="space-y-6 p-5">
          <div className="rounded-2xl border bg-background p-5">
            <p className="whitespace-pre-wrap break-words text-lg font-medium leading-relaxed text-[var(--navy)]">
              {notification.message}
            </p>
            <div className="mt-5 grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
              <div>
                <span className="font-medium text-[var(--navy)]">Received:</span>{" "}
                {format(new Date(notification.created_at), "PPpp")}
              </div>
              <div>
                <span className="font-medium text-[var(--navy)]">Age:</span>{" "}
                {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border bg-secondary/30 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-[var(--navy)]">Related workspace page</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Open the relevant page to take action or see the full record.
              </p>
            </div>
            {relatedTarget && (
              <Button asChild className="bg-[var(--navy)] text-white hover:bg-[var(--navy-light)]">
                <Link to={relatedTarget.to as any}>
                  {relatedTarget.label}
                  <ExternalLink className="size-4" />
                </Link>
              </Button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function notificationTypeLabel(type: string) {
  const normalized = type.replaceAll("_", " ");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function getRelatedTarget(notification: NotificationRow, profile: Profile) {
  const type = notification.type.toLowerCase();
  if (type.includes("message")) return { label: "Open messages", to: "/messages" };
  if (type.includes("leave")) {
    return isManager(profile)
      ? { label: "Open leave requests", to: "/leaves" }
      : { label: "Open apply leave", to: "/apply-leave" };
  }
  if (type.includes("swap")) return { label: "Open shift swaps", to: "/swaps" };
  if (type.includes("attendance") || type.includes("check")) {
    return { label: "Open attendance", to: "/attendance" };
  }
  if (type.includes("roster")) {
    return isManager(profile)
      ? { label: "Open rosters", to: "/roster" }
      : { label: "Open my roster", to: "/my-roster" };
  }
  if (type.includes("holiday")) {
    return isManager(profile)
      ? { label: "Open holidays", to: "/holidays" }
      : { label: "Open calendar", to: "/calendar" };
  }
  return { label: "Open dashboard", to: "/dashboard" };
}
