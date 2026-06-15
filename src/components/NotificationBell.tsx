import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";

type Notification = {
  id: string;
  type: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

export function NotificationBell({ userId }: { userId: string }) {
  const [items, setItems] = useState<Notification[]>([]);

  const load = async () => {
    const { data } = await supabase
      .from("notifications")
      .select("id, type, message, is_read, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);
    setItems((data as Notification[]) ?? []);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("notif-" + userId)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const unread = items.filter((n) => !n.is_read).length;

  const markAllRead = async () => {
    if (!unread) return;
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", userId).eq("is_read", false);
    load();
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="relative inline-flex items-center justify-center size-9 rounded-md hover:bg-secondary transition-colors"
          aria-label="Notifications"
        >
          <Bell className="size-4 text-[var(--navy)]" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--navy)] text-white text-[10px] font-semibold flex items-center justify-center">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="font-semibold text-sm">Notifications</div>
          <button onClick={markAllRead} className="text-xs text-muted-foreground hover:text-[var(--navy)]">
            Mark all read
          </button>
        </div>
        <div className="max-h-80 overflow-auto">
          {items.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">No notifications.</div>
          ) : (
            items.map((n) => (
              <div
                key={n.id}
                className={`px-4 py-3 border-b last:border-0 text-sm ${
                  n.is_read ? "" : "bg-secondary/50"
                }`}
              >
                <div className="text-[var(--navy)]">{n.message}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {new Date(n.created_at).toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
