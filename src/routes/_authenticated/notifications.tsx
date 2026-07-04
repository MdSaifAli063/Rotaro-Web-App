import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { Archive, AtSign, Bell, BellRing, CheckCheck, Inbox, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { fetchProfile, type Profile } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/notifications")({
  component: NotificationsPage,
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

type TabKey = "all" | "mention" | "reminder";

function NotificationsPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchProfile().then(setProfile);
  }, []);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("notifications")
      .select(
        "id, business_id, user_id, type, message, related_id, is_read, dismissed_at, deleted_at, created_at",
      )
      .eq("user_id", profile.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      toast.error("Failed to load notifications: " + error.message);
      setItems([]);
      setLoading(false);
      return;
    }

    setItems((data as NotificationRow[]) ?? []);
    setLoading(false);
  }, [profile?.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!profile?.id) return;
    const channel = supabase
      .channel(`notifications-page:${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${profile.id}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const oldRow = payload.old as Pick<NotificationRow, "id">;
            setItems((current) => current.filter((item) => item.id !== oldRow.id));
            return;
          }

          const next = payload.new as NotificationRow;
          setItems((current) => {
            const withoutDuplicate = current.filter((item) => item.id !== next.id);
            if (next.deleted_at) return withoutDuplicate;
            return [next, ...withoutDuplicate].sort(
              (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
            );
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  const stats = useMemo(() => {
    const unread = items.filter((item) => !item.is_read).length;
    const hidden = items.filter((item) => item.dismissed_at).length;
    return {
      total: items.length,
      unread,
      hidden,
      active: items.length - hidden,
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((item) => {
      const type = item.type.toLowerCase();
      const message = item.message.toLowerCase();
      if (activeTab === "mention" && !type.includes("mention") && !message.includes("@")) {
        return false;
      }
      if (
        activeTab === "reminder" &&
        !type.includes("reminder") &&
        !type.includes("upcoming") &&
        !type.includes("task") &&
        !type.includes("due")
      ) {
        return false;
      }
      if (!normalizedQuery) return true;
      return (
        message.includes(normalizedQuery) || type.replaceAll("_", " ").includes(normalizedQuery)
      );
    });
  }, [activeTab, items, query]);

  const markAllRead = async () => {
    if (!profile?.id || !stats.unread || saving) return;
    setSaving(true);
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", profile.id)
      .is("deleted_at", null)
      .eq("is_read", false);
    setSaving(false);
    if (error) {
      toast.error("Failed to mark notifications as read: " + error.message);
      return;
    }
    setItems((current) => current.map((item) => ({ ...item, is_read: true })));
    toast.success("All notifications marked as read");
  };

  const clearReadFromBell = async () => {
    if (!profile?.id || saving) return;
    const hasClearableRead = items.some((item) => item.is_read && !item.dismissed_at);
    if (!hasClearableRead) return;
    setSaving(true);
    const dismissedAt = new Date().toISOString();
    const { error } = await supabase
      .from("notifications")
      .update({ dismissed_at: dismissedAt })
      .eq("user_id", profile.id)
      .is("deleted_at", null)
      .is("dismissed_at", null)
      .eq("is_read", true);
    setSaving(false);
    if (error) {
      toast.error("Failed to clear read notifications: " + error.message);
      return;
    }
    setItems((current) =>
      current.map((item) =>
        item.is_read && !item.dismissed_at ? { ...item, dismissed_at: dismissedAt } : item,
      ),
    );
    toast.success("Read notifications hidden from bell");
  };

  const clearAllFromBell = async () => {
    if (!profile?.id || !stats.active || saving) return;
    setSaving(true);
    const dismissedAt = new Date().toISOString();
    const { error } = await supabase
      .from("notifications")
      .update({ dismissed_at: dismissedAt, is_read: true })
      .eq("user_id", profile.id)
      .is("deleted_at", null)
      .is("dismissed_at", null);
    setSaving(false);
    if (error) {
      toast.error("Failed to clear notifications: " + error.message);
      return;
    }
    setItems((current) =>
      current.map((item) =>
        item.dismissed_at ? item : { ...item, dismissed_at: dismissedAt, is_read: true },
      ),
    );
    toast.success("Notifications hidden from bell");
  };

  const deleteNotification = async (notification: NotificationRow) => {
    if (!profile?.id || saving) return;
    setSaving(true);
    const deletedAt = new Date().toISOString();
    const { error } = await supabase
      .from("notifications")
      .update({ deleted_at: deletedAt, dismissed_at: deletedAt, is_read: true })
      .eq("id", notification.id)
      .eq("user_id", profile.id);
    setSaving(false);
    if (error) {
      toast.error("Failed to delete notification: " + error.message);
      return;
    }
    setItems((current) => current.filter((item) => item.id !== notification.id));
    toast.success("Notification deleted");
  };

  const openNotification = async (notification: NotificationRow) => {
    if (profile?.id && !notification.is_read) {
      setItems((current) =>
        current.map((item) => (item.id === notification.id ? { ...item, is_read: true } : item)),
      );
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", notification.id)
        .eq("user_id", profile.id)
        .is("deleted_at", null);
    }
    navigate({ to: "/notifications/$id", params: { id: notification.id } });
  };

  if (!profile || loading) {
    return (
      <div className="rounded-2xl border bg-card p-8 text-sm text-muted-foreground shadow-sm">
        Loading notifications...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-sm font-semibold text-blue-600">Inbox</div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-[var(--navy)]">
            Notifications
          </h1>
          <p className="mt-1 text-muted-foreground">
            All alerts, approvals, schedule updates, messages, and reminders in one place.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={markAllRead} disabled={!stats.unread || saving}>
            <CheckCheck className="size-4" />
            Read all
          </Button>
          <Button
            variant="outline"
            onClick={clearReadFromBell}
            disabled={!items.some((item) => item.is_read && !item.dismissed_at) || saving}
          >
            <Archive className="size-4" />
            Clear read
          </Button>
          <Button variant="outline" onClick={clearAllFromBell} disabled={!stats.active || saving}>
            <Archive className="size-4" />
            Clear all from bell
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Total stored" value={stats.total} icon={Inbox} />
        <SummaryCard label="Unread" value={stats.unread} icon={Bell} />
        <SummaryCard label="Visible in bell" value={stats.active} icon={BellRing} />
        <SummaryCard label="Hidden from bell" value={stats.hidden} icon={Archive} />
      </div>

      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="space-y-4 border-b p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabKey)}>
              <TabsList className="grid h-11 w-full grid-cols-3 rounded-2xl bg-[#EEF2F8] p-1 sm:w-[26rem]">
                <TabsTrigger value="all" className="rounded-xl">
                  <Inbox className="mr-2 size-4" />
                  All
                </TabsTrigger>
                <TabsTrigger value="mention" className="rounded-xl">
                  <AtSign className="mr-2 size-4" />
                  Mention
                </TabsTrigger>
                <TabsTrigger value="reminder" className="rounded-xl">
                  <BellRing className="mr-2 size-4" />
                  Reminder
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative w-full lg:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search notifications..."
                className="h-11 rounded-xl pl-9"
              />
            </div>
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <div className="flex min-h-[18rem] flex-col items-center justify-center px-5 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-secondary text-[var(--navy)]">
              <Bell className="size-5" />
            </div>
            <h2 className="mt-4 text-xl font-semibold text-[var(--navy)]">
              No notifications found
            </h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              New leave, roster, attendance, message, and shift swap updates will appear here.
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {filteredItems.map((notification) => (
              <article
                key={notification.id}
                className={cn(
                  "flex flex-col gap-4 p-4 transition-colors sm:p-5 xl:flex-row xl:items-start xl:justify-between",
                  notification.is_read ? "bg-card" : "bg-blue-50/50",
                )}
              >
                <button
                  onClick={() => openNotification(notification)}
                  className="flex min-w-0 flex-1 gap-3 text-left"
                >
                  <span
                    className={cn(
                      "mt-2 size-2.5 shrink-0 rounded-full",
                      notification.is_read ? "bg-slate-300" : "bg-[var(--navy)]",
                    )}
                  />
                  <span className="min-w-0">
                    <span className="block break-words text-base font-semibold text-[var(--navy)]">
                      {notification.message}
                    </span>
                    <span className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <span>
                        {formatDistanceToNow(new Date(notification.created_at), {
                          addSuffix: true,
                        })}
                      </span>
                      <span>-</span>
                      <span>{format(new Date(notification.created_at), "PPp")}</span>
                    </span>
                    <span className="mt-3 flex flex-wrap gap-2">
                      <Badge variant={notification.is_read ? "secondary" : "default"}>
                        {notification.is_read ? "Read" : "Unread"}
                      </Badge>
                      <Badge variant="outline">{notification.type.replaceAll("_", " ")}</Badge>
                      {notification.dismissed_at && (
                        <Badge variant="secondary">Hidden from bell</Badge>
                      )}
                    </span>
                  </span>
                </button>

                <div className="flex shrink-0 flex-wrap gap-2 xl:justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteNotification(notification)}
                    disabled={saving}
                    className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                  >
                    <Trash2 className="size-4" />
                    Delete
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Bell;
}) {
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-3 text-3xl font-bold text-[var(--navy)]">{value}</p>
        </div>
        <div className="flex size-11 items-center justify-center rounded-2xl bg-secondary text-[var(--navy)]">
          <Icon className="size-5" />
        </div>
      </div>
    </section>
  );
}
