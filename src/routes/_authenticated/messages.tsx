import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Inbox, Mail, MailOpen, Send, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { fetchProfile, type Profile } from "@/lib/auth";
import { notify } from "@/lib/notify";

export const Route = createFileRoute("/_authenticated/messages")({
  component: MessagesPage,
});

type Person = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type MessageRow = {
  id: string;
  business_id: string;
  sender_id: string;
  recipient_id: string;
  subject: string;
  body: string;
  is_read: boolean;
  created_at: string;
  updated_at: string;
  sender?: Person | null;
  recipient?: Person | null;
};

type Box = "inbox" | "sent";

function MessagesPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [activeBox, setActiveBox] = useState<Box>("inbox");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [recipientId, setRecipientId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    (async () => {
      const nextProfile = await fetchProfile();
      setProfile(nextProfile);
    })();
  }, []);

  const loadPeople = useCallback(async () => {
    if (!profile?.business_id) return;
    const { data, error } = await supabase
      .from("profiles")
      .select("id, name, email, role")
      .eq("business_id", profile.business_id)
      .neq("id", profile.id)
      .order("name", { ascending: true });

    if (error) {
      toast.error("Failed to load recipients: " + error.message);
      setPeople([]);
      return;
    }
    setPeople((data ?? []) as Person[]);
  }, [profile?.business_id, profile?.id]);

  const loadMessages = useCallback(async () => {
    if (!profile?.business_id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("messages")
      .select(
        "*, sender:profiles!messages_sender_id_fkey(id, name, email, role), recipient:profiles!messages_recipient_id_fkey(id, name, email, role)",
      )
      .eq("business_id", profile.business_id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      toast.error("Failed to load messages: " + error.message);
      setMessages([]);
    } else {
      setMessages((data ?? []) as unknown as MessageRow[]);
    }
    setLoading(false);
  }, [profile?.business_id]);

  useEffect(() => {
    loadPeople();
    loadMessages();
  }, [loadMessages, loadPeople]);

  useEffect(() => {
    if (!profile?.business_id) return;
    const channel = supabase
      .channel(`messages:${profile.business_id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `business_id=eq.${profile.business_id}`,
        },
        () => {
          loadMessages();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadMessages, profile?.business_id]);

  const inboxMessages = useMemo(
    () => messages.filter((message) => message.recipient_id === profile?.id),
    [messages, profile?.id],
  );

  const sentMessages = useMemo(
    () => messages.filter((message) => message.sender_id === profile?.id),
    [messages, profile?.id],
  );

  const visibleMessages = activeBox === "inbox" ? inboxMessages : sentMessages;
  const selectedMessage =
    visibleMessages.find((message) => message.id === selectedId) ?? visibleMessages[0] ?? null;
  const unreadCount = inboxMessages.filter((message) => !message.is_read).length;

  useEffect(() => {
    if (!selectedMessage || !profile || activeBox !== "inbox" || selectedMessage.is_read) return;
    supabase
      .from("messages")
      .update({ is_read: true })
      .eq("id", selectedMessage.id)
      .eq("recipient_id", profile.id)
      .then(({ error }) => {
        if (error) console.error("Message read update failed:", error.message);
      });
  }, [activeBox, profile, selectedMessage]);

  const sendMessage = async () => {
    if (!profile?.business_id) return;
    if (!recipientId) {
      toast.error("Choose a recipient.");
      return;
    }
    if (!body.trim()) {
      toast.error("Write a message before sending.");
      return;
    }

    setSending(true);
    const cleanSubject = subject.trim() || "New message";
    const cleanBody = body.trim();
    const { data, error } = await supabase
      .from("messages")
      .insert({
        business_id: profile.business_id,
        sender_id: profile.id,
        recipient_id: recipientId,
        subject: cleanSubject,
        body: cleanBody,
      })
      .select("id")
      .single();

    if (error) {
      toast.error(error.message);
      setSending(false);
      return;
    }

    await notify({
      userId: recipientId,
      businessId: profile.business_id,
      type: "message_received",
      message: `${profile.name || profile.email} sent you a message: ${cleanSubject}`,
      relatedId: data.id,
    }).catch((notifyError) => console.error(notifyError));

    toast.success("Message sent");
    setRecipientId("");
    setSubject("");
    setBody("");
    setActiveBox("sent");
    setSelectedId(data.id);
    setSending(false);
    loadMessages();
  };

  if (!profile) return null;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-[var(--navy)]">Messages</h1>
          <p className="text-sm text-muted-foreground">
            Send workspace messages and receive replies in realtime.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[380px]">
          <SummaryCard icon={Inbox} label="Inbox" value={inboxMessages.length} />
          <SummaryCard icon={MailOpen} label="Unread" value={unreadCount} />
        </div>
      </header>

      <section className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <Tabs value={activeBox} onValueChange={(value) => setActiveBox(value as Box)}>
              <TabsList className="grid h-11 w-full grid-cols-2 rounded-xl bg-secondary p-1">
                <TabsTrigger value="inbox" className="rounded-lg">
                  Inbox
                </TabsTrigger>
                <TabsTrigger value="sent" className="rounded-lg">
                  Sent
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="mt-4 max-h-[520px] space-y-2 overflow-auto pr-1">
              {loading ? (
                <EmptyState text="Loading messages..." />
              ) : visibleMessages.length === 0 ? (
                <EmptyState
                  text={activeBox === "inbox" ? "No inbox messages yet." : "No sent messages yet."}
                />
              ) : (
                visibleMessages.map((message) => (
                  <button
                    key={message.id}
                    onClick={() => setSelectedId(message.id)}
                    className={`w-full rounded-xl border p-4 text-left transition-colors hover:bg-secondary/50 ${
                      selectedMessage?.id === message.id
                        ? "border-[var(--navy)] bg-secondary/40"
                        : "bg-card"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-[var(--navy)]">
                          {message.subject || "New message"}
                        </div>
                        <div className="mt-1 truncate text-sm text-muted-foreground">
                          {activeBox === "inbox"
                            ? message.sender?.name || message.sender?.email || "Sender"
                            : message.recipient?.name || message.recipient?.email || "Recipient"}
                        </div>
                      </div>
                      {activeBox === "inbox" && !message.is_read && (
                        <span className="mt-1 size-2.5 rounded-full bg-[var(--navy)]" />
                      )}
                    </div>
                    <div className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                      {message.body}
                    </div>
                    <div className="mt-3 text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 text-lg font-semibold text-[var(--navy)]">
              <Send className="size-5" />
              Compose
            </div>
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label>To</Label>
                <Select value={recipientId} onValueChange={setRecipientId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose recipient" />
                  </SelectTrigger>
                  <SelectContent>
                    {people.map((person) => (
                      <SelectItem key={person.id} value={person.id}>
                        {person.name || person.email} ({person.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Subject</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Message</Label>
                <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
              </div>
              <Button
                onClick={sendMessage}
                disabled={sending}
                className="w-full bg-[var(--navy)] text-white hover:bg-[var(--navy-light)]"
              >
                <Send className="size-4" />
                {sending ? "Sending..." : "Send message"}
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-card shadow-sm">
          {selectedMessage ? (
            <div className="flex min-h-[620px] flex-col">
              <div className="border-b p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold text-[var(--navy)]">
                      {selectedMessage.subject || "New message"}
                    </h2>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <UserRound className="size-4" />
                      <span>
                        From{" "}
                        {selectedMessage.sender?.name || selectedMessage.sender?.email || "Sender"}
                      </span>
                      <span>to</span>
                      <span>
                        {selectedMessage.recipient?.name ||
                          selectedMessage.recipient?.email ||
                          "Recipient"}
                      </span>
                    </div>
                  </div>
                  <Badge variant="outline">
                    {formatDistanceToNow(new Date(selectedMessage.created_at), { addSuffix: true })}
                  </Badge>
                </div>
              </div>
              <div className="flex-1 whitespace-pre-wrap p-5 text-sm leading-7 text-[var(--navy)]">
                {selectedMessage.body}
              </div>
            </div>
          ) : (
            <div className="flex min-h-[620px] items-center justify-center p-6">
              <EmptyState text="Select a message to read it here." />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Inbox;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Icon className="size-4 text-[var(--navy)]" />
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold text-[var(--navy)]">{value}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border px-4 py-10 text-center text-sm text-muted-foreground">
      <Mail className="mx-auto mb-3 size-6 text-muted-foreground" />
      {text}
    </div>
  );
}
