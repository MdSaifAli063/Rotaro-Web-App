import { useEffect, useMemo, useState } from "react";
import { Bell, AtSign, BellRing, Inbox, X } from "lucide-react";
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
  created_at: string;
};

type TabKey = "all" | "mention" | "reminder";

export function NotificationBell({ userId }: { userId: string }) {
  const [items, setItems] = useState<Notification[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>("all");

  const load = async () => {
    const { data, error } = await supabase
      .from("notifications")
      .select("id, type, message, is_read, created_at")
      .eq("user_id", userId)
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
            setItems((current) => current.map((item) => (item.id === next.id ? next : item)));
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
    if (!unread) return;
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false);
    await load();
  };

  return (
    <Popover
      onOpenChange={(open) => {
        if (open) markAllRead();
      }}
    >
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

        <div className="border-b px-4 py-3 text-sm font-medium text-muted-foreground">
          Notifications
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
                className={cn(
                  "w-full border-b px-4 py-3 text-left text-sm transition-colors last:border-0 hover:bg-secondary/50",
                  n.is_read ? "bg-background" : "bg-blue-50/40",
                )}
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
