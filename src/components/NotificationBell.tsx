import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bell, AtSign, BellRing, CheckCheck, Inbox, Trash2, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

type Notification = {
  id: string;
  type: string;
  message: string;
  is_read: boolean;
  dismissed_at: string | null;
  deleted_at: string | null;
  created_at: string;
};

type TabKey = "all" | "mention" | "reminder";

export function NotificationBell({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const [items, setItems] = useState<Notification[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data, error } = await supabase
      .from("notifications")
      .select("id, type, message, is_read, dismissed_at, deleted_at, created_at")
      .eq("user_id", userId)
      .is("dismissed_at", null)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      console.error("Error loading notifications:", error.message);
      setItems([]);
      return;
    }
    setItems((data as Notification[]) ?? []);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`notif-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const next = payload.new as Notification;
            setItems((current) => {
              const withoutDuplicate = current.filter((item) => item.id !== next.id);
              return [next, ...withoutDuplicate].slice(0, 50);
            });
            toast.info(next.message);
            return;
          }
          if (payload.eventType === "UPDATE") {
            const next = payload.new as Notification;
            setItems((current) => {
              if (next.dismissed_at || next.deleted_at) {
                return current.filter((item) => item.id !== next.id);
              }
              return current.map((item) => (item.id === next.id ? next : item));
            });
            return;
          }
          if (payload.eventType === "DELETE") {
            const oldNotification = payload.old as Pick<Notification, "id">;
            setItems((current) => current.filter((item) => item.id !== oldNotification.id));
            return;
          }
          load();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const unread = useMemo(() => items.filter((n) => !n.is_read).length, [items]);
  const readCount = useMemo(() => items.filter((n) => n.is_read).length, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const type = item.type.toLowerCase();
      const message = item.message.toLowerCase();
      if (activeTab === "mention") return type.includes("mention") || message.includes("@");
      if (activeTab === "reminder") {
        return (
          type.includes("reminder") ||
          type.includes("upcoming") ||
          type.includes("task") ||
          type.includes("due")
        );
      }
      return true;
    });
  }, [activeTab, items]);

  const markAllRead = async () => {
    if (!unread || saving) return;
    setSaving(true);
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .is("dismissed_at", null)
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

  const clearRead = async () => {
    if (!readCount || saving) return;
    setSaving(true);
    const dismissedAt = new Date().toISOString();
    const { error } = await supabase
      .from("notifications")
      .update({ dismissed_at: dismissedAt })
      .eq("user_id", userId)
      .is("dismissed_at", null)
      .is("deleted_at", null)
      .eq("is_read", true);
    setSaving(false);
    if (error) {
      toast.error("Failed to clear read notifications: " + error.message);
      return;
    }
    setItems((current) => current.filter((item) => !item.is_read));
    toast.success("Read notifications cleared");
  };

  const clearAll = async () => {
    if (!items.length || saving) return;
    if (!window.confirm("Clear all notifications from the bell?")) return;
    setSaving(true);
    const dismissedAt = new Date().toISOString();
    const { error } = await supabase
      .from("notifications")
      .update({ dismissed_at: dismissedAt, is_read: true })
      .eq("user_id", userId)
      .is("dismissed_at", null)
      .is("deleted_at", null);
    setSaving(false);
    if (error) {
      toast.error("Failed to clear notifications: " + error.message);
      return;
    }
    setItems([]);
    setOpen(false);
    toast.success("Notifications hidden from bell");
  };

  const openNotification = async (notification: Notification) => {
    setOpen(false);
    if (!notification.is_read) {
      setItems((current) =>
        current.map((item) => (item.id === notification.id ? { ...item, is_read: true } : item)),
      );
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("id", notification.id)
        .eq("user_id", userId)
        .is("deleted_at", null);
      if (error) console.error("Notification read update failed:", error.message);
    }
    navigate({
      to: "/notifications/$id",
      params: { id: notification.id },
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-[var(--navy)]"
          aria-label="Notifications"
        >
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--navy)] px-1 text-[10px] font-semibold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[calc(100vw-1rem)] max-w-[22rem] rounded-2xl border p-0 shadow-xl"
      >
        <div className="flex items-center justify-between border-b px-4 py-4">
          <div className="text-lg font-semibold text-[var(--navy)]">Notification</div>
          <PopoverPrimitive.Close asChild>
            <Button variant="ghost" size="icon" className="size-8 rounded-full">
              <X className="size-4" />
            </Button>
          </PopoverPrimitive.Close>
        </div>

        <div className="px-4 pt-3">
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabKey)}>
            <TabsList className="grid h-12 w-full grid-cols-3 rounded-2xl bg-[#EEF2F8] p-1">
              <TabsTrigger value="all" className="rounded-xl px-2 text-xs sm:text-sm">
                <Inbox className="mr-1 size-4 sm:mr-2" />
                All
              </TabsTrigger>
              <TabsTrigger value="mention" className="rounded-xl px-2 text-xs sm:text-sm">
                <AtSign className="mr-1 size-4 sm:mr-2" />
                Mention
              </TabsTrigger>
              <TabsTrigger value="reminder" className="rounded-xl px-2 text-xs sm:text-sm">
                <BellRing className="mr-1 size-4 sm:mr-2" />
                Reminder
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="space-y-3 border-b px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-muted-foreground">Notifications</div>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <span className="rounded-full bg-[var(--navy)] px-2 py-0.5 text-xs font-semibold text-white">
                  {unread} unread
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setOpen(false);
                  navigate({ to: "/notifications" });
                }}
                className="h-8 rounded-xl px-2 text-xs"
              >
                View all
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={markAllRead}
              disabled={!unread || saving}
              className="h-8 rounded-xl"
            >
              <CheckCheck className="size-3.5" />
              Read all
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={clearRead}
              disabled={!readCount || saving}
              className="h-8 rounded-xl"
            >
              Clear read
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={clearAll}
              disabled={!items.length || saving}
              className="h-8 rounded-xl border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="size-3.5" />
              Clear all
            </Button>
          </div>
        </div>

        <div className="max-h-[18rem] overflow-auto">
          {filteredItems.length === 0 ? (
            <div className="flex min-h-[12rem] items-center justify-center px-4 py-8 text-center text-sm text-muted-foreground">
              No notifications yet
            </div>
          ) : (
            filteredItems.map((n) => (
              <button
                key={n.id}
                onClick={() => openNotification(n)}
                className={cn(
                  "w-full border-b px-4 py-3 text-left text-sm transition-colors last:border-0 hover:bg-secondary/50",
                  n.is_read ? "bg-background" : "bg-blue-50/40",
                )}
                aria-label={`Open notification: ${n.message}`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "mt-1 size-2 rounded-full",
                      n.is_read ? "bg-slate-300" : "bg-[var(--navy)]",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[var(--navy)]">{n.message}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
