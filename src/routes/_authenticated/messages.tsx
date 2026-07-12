import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { CheckCheck, Inbox, Mail, MailOpen, Send, Trash2, UserRound } from "lucide-react";
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
import { UserAvatar } from "@/components/UserAvatar";
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

type Conversation = {
  personId: string;
  person: Person;
  latest: MessageRow;
  messages: MessageRow[];
  unread: number;
};

const personLabel = (person?: Person | null) => person?.name || person?.email || "Unknown user";

function MessagesPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [recipientId, setRecipientId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const autoReadMessageIds = useRef(new Set<string>());

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

  const participantMessages = useMemo(
    () =>
      messages.filter(
        (message) => message.sender_id === profile?.id || message.recipient_id === profile?.id,
      ),
    [messages, profile?.id],
  );

  const conversations = useMemo(() => {
    if (!profile) return [];
    const peopleById = new Map(people.map((person) => [person.id, person]));
    const grouped = new Map<string, Conversation>();

    participantMessages.forEach((message) => {
      const mine = message.sender_id === profile.id;
      const personId = mine ? message.recipient_id : message.sender_id;
      const person = peopleById.get(personId) ??
        (mine ? message.recipient : message.sender) ?? {
          id: personId,
          name: "Unknown user",
          email: "",
          role: "user",
        };
      const existing = grouped.get(personId);
      grouped.set(personId, {
        personId,
        person,
        latest:
          !existing || new Date(message.created_at) > new Date(existing.latest.created_at)
            ? message
            : existing.latest,
        messages: [...(existing?.messages ?? []), message],
        unread: 0,
      });
    });

    return Array.from(grouped.values())
      .map((conversation) => ({
        ...conversation,
        messages: conversation.messages.sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        ),
        unread: conversation.messages.filter(
          (message) => message.recipient_id === profile.id && !message.is_read,
        ).length,
      }))
      .sort(
        (a, b) => new Date(b.latest.created_at).getTime() - new Date(a.latest.created_at).getTime(),
      );
  }, [participantMessages, people, profile]);

  useEffect(() => {
    if (selectedPersonId) {
      const selectedExistsInPeople = people.some((person) => person.id === selectedPersonId);
      const selectedExistsInConversations = conversations.some(
        (conversation) => conversation.personId === selectedPersonId,
      );

      if (selectedExistsInPeople || selectedExistsInConversations) {
        return;
      }
    }

    const fallback = conversations[0]?.personId ?? people[0]?.id ?? null;
    if (fallback !== selectedPersonId) {
      setSelectedPersonId(fallback);
      setRecipientId(fallback ?? "");
    }
  }, [conversations, people, selectedPersonId]);

  const selectedConversation =
    conversations.find((conversation) => conversation.personId === selectedPersonId) ?? null;
  const selectedPerson = useMemo(
    () =>
      people.find((person) => person.id === selectedPersonId) ??
      selectedConversation?.person ??
      null,
    [people, selectedConversation?.person, selectedPersonId],
  );

  const unreadCount = conversations.reduce((sum, conversation) => sum + conversation.unread, 0);

  useEffect(() => {
    if (!profile?.business_id || !selectedConversation) return;
    const unreadIds = selectedConversation.messages
      .filter(
        (message) =>
          message.recipient_id === profile.id &&
          !message.is_read &&
          !autoReadMessageIds.current.has(message.id),
      )
      .map((message) => message.id);

    if (!unreadIds.length) return;
    unreadIds.forEach((id) => autoReadMessageIds.current.add(id));

    supabase
      .from("messages")
      .update({ is_read: true })
      .in("id", unreadIds)
      .eq("recipient_id", profile.id)
      .then(({ error }) => {
        if (error) console.error("Message read update failed:", error.message);
        else {
          setMessages((current) =>
            current.map((message) =>
              unreadIds.includes(message.id) ? { ...message, is_read: true } : message,
            ),
          );
        }
      });
  }, [profile, selectedConversation]);

  const markThreadRead = async () => {
    if (!profile || !selectedConversation) return;
    const unreadIds = selectedConversation.messages
      .filter((message) => message.recipient_id === profile.id && !message.is_read)
      .map((message) => message.id);
    if (!unreadIds.length) return;

    setSavingId("thread-read");
    const { error } = await supabase
      .from("messages")
      .update({ is_read: true })
      .in("id", unreadIds)
      .eq("recipient_id", profile.id);
    setSavingId(null);

    if (error) {
      toast.error("Unable to mark messages as read: " + error.message);
      return;
    }

    setMessages((current) =>
      current.map((message) =>
        unreadIds.includes(message.id) ? { ...message, is_read: true } : message,
      ),
    );
    toast.success("Conversation marked as read");
  };

  const deleteMessage = async (message: MessageRow) => {
    setSavingId(message.id);
    const { error } = await supabase
      .from("messages")
      .delete()
      .eq("id", message.id)
      .eq("business_id", message.business_id);
    setSavingId(null);

    if (error) {
      toast.error("Unable to delete message: " + error.message);
      return;
    }

    setMessages((current) => current.filter((item) => item.id !== message.id));
    toast.success("Message deleted");
  };

  const deleteConversation = async () => {
    if (!profile?.business_id || !selectedConversation) return;
    setSavingId("conversation-delete");
    const businessId = profile.business_id;
    const personId = selectedConversation.personId;
    const { error } = await supabase
      .from("messages")
      .delete()
      .eq("business_id", businessId)
      .or(
        `and(sender_id.eq.${profile.id},recipient_id.eq.${personId}),and(sender_id.eq.${personId},recipient_id.eq.${profile.id})`,
      );
    setSavingId(null);

    if (error) {
      toast.error("Unable to delete conversation: " + error.message);
      return;
    }

    setMessages((current) =>
      current.filter((message) => {
        const sameThread =
          (message.sender_id === profile.id && message.recipient_id === personId) ||
          (message.sender_id === personId && message.recipient_id === profile.id);
        return !sameThread;
      }),
    );
    setSelectedPersonId(
      conversations.find((conversation) => conversation.personId !== personId)?.personId ?? null,
    );
    setRecipientId((current) => (current === personId ? "" : current));
    toast.success("Conversation deleted");
  };

  const selectRecipient = (personId: string) => {
    setSelectedPersonId(personId);
    setRecipientId(personId);
  };

  const sendMessage = async () => {
    if (!profile?.business_id) return;
    const targetRecipientId = recipientId || selectedPersonId;
    if (!targetRecipientId) {
      toast.error("Choose a recipient.");
      return;
    }
    if (!body.trim()) {
      toast.error("Write a message before sending.");
      return;
    }

    setSending(true);
    const cleanSubject = subject.trim() || selectedConversation?.latest.subject || "New message";
    const cleanBody = body.trim();
    const { data, error } = await supabase
      .from("messages")
      .insert({
        business_id: profile.business_id,
        sender_id: profile.id,
        recipient_id: targetRecipientId,
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
      userId: targetRecipientId,
      businessId: profile.business_id,
      type: "message_received",
      message: `${profile.name || profile.email} sent you a message: ${cleanSubject}`,
      relatedId: data.id,
    }).catch((notifyError) => console.error(notifyError));

    toast.success("Message sent");
    setRecipientId(targetRecipientId);
    setSelectedPersonId(targetRecipientId);
    setSubject("");
    setBody("");
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
          <SummaryCard icon={Inbox} label="Conversations" value={conversations.length} />
          <SummaryCard icon={MailOpen} label="Unread" value={unreadCount} />
        </div>
      </header>

      <section className="grid min-h-[560px] gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--navy)]">Conversations</h2>
              <p className="text-xs text-muted-foreground">People who sent or received messages.</p>
            </div>
            <Badge variant="outline">{participantMessages.length}</Badge>
          </div>

          <div className="mt-4 space-y-3">
            <Label>Start or switch person</Label>
            <Select value={recipientId || selectedPersonId || ""} onValueChange={selectRecipient}>
              <SelectTrigger>
                <SelectValue placeholder="Choose recipient" />
              </SelectTrigger>
              <SelectContent>
                {people.map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {personLabel(person)} ({person.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="mt-4 max-h-[560px] space-y-2 overflow-auto pr-1">
            {loading ? (
              <EmptyState text="Loading messages..." />
            ) : conversations.length === 0 ? (
              <EmptyState text="No conversations yet. Choose a recipient to start one." />
            ) : (
              conversations.map((conversation) => {
                const latestMine = conversation.latest.sender_id === profile.id;
                return (
                  <button
                    key={conversation.personId}
                    onClick={() => selectRecipient(conversation.personId)}
                    className={`w-full rounded-xl border p-3 text-left transition-colors hover:bg-secondary/50 ${
                      selectedPersonId === conversation.personId
                        ? "border-[var(--navy)] bg-secondary/40"
                        : "bg-card"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <UserAvatar
                        name={conversation.person.name}
                        email={conversation.person.email}
                        size={42}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-[var(--navy)]">
                              {personLabel(conversation.person)}
                            </div>
                            <div className="truncate text-xs capitalize text-muted-foreground">
                              {conversation.person.role}
                            </div>
                          </div>
                          {conversation.unread > 0 && (
                            <Badge className="bg-[var(--navy)] text-white hover:bg-[var(--navy)]">
                              {conversation.unread}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-2 truncate text-sm text-muted-foreground">
                          <span className="font-medium text-[var(--navy)]">
                            {latestMine ? "You: " : `${personLabel(conversation.person)}: `}
                          </span>
                          {conversation.latest.body}
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(conversation.latest.created_at), {
                            addSuffix: true,
                          })}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="min-w-0 overflow-hidden rounded-2xl border bg-card shadow-sm">
          {selectedPerson ? (
            <div className="flex min-h-[560px] flex-col">
              <div className="border-b p-4 sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <UserAvatar name={selectedPerson.name} email={selectedPerson.email} size={48} />
                    <div className="min-w-0">
                      <h2 className="truncate text-xl font-semibold text-[var(--navy)]">
                        {personLabel(selectedPerson)}
                      </h2>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <UserRound className="size-4" />
                        <span className="capitalize">{selectedPerson.role}</span>
                        {selectedPerson.email && <span>{selectedPerson.email}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={markThreadRead}
                      disabled={!selectedConversation?.unread || savingId === "thread-read"}
                    >
                      <CheckCheck className="size-4" />
                      Mark read
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={deleteConversation}
                      disabled={savingId === "conversation-delete"}
                      className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                      <Trash2 className="size-4" />
                      Delete chat
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex-1 space-y-4 overflow-auto bg-[#F8FAFD] p-4 sm:p-6">
                {selectedConversation?.messages.length ? (
                  selectedConversation.messages.map((message) => {
                    const mine = message.sender_id === profile.id;
                    return (
                      <div
                        key={message.id}
                        className={`group flex gap-3 ${mine ? "justify-end" : "justify-start"}`}
                      >
                        {!mine && (
                          <UserAvatar
                            name={message.sender?.name}
                            email={message.sender?.email}
                            size={34}
                          />
                        )}
                        <div className={`max-w-[82%] space-y-1 ${mine ? "items-end" : ""}`}>
                          <div
                            className={`flex items-center gap-2 text-xs text-muted-foreground ${
                              mine ? "justify-end" : ""
                            }`}
                          >
                            <span>{mine ? "You" : personLabel(message.sender)}</span>
                            <span>
                              {formatDistanceToNow(new Date(message.created_at), {
                                addSuffix: true,
                              })}
                            </span>
                            {!mine && !message.is_read && (
                              <span className="size-2 rounded-full bg-[var(--navy)]" />
                            )}
                          </div>
                          <div
                            className={`rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
                              mine
                                ? "rounded-br-md bg-[var(--navy)] text-white"
                                : "rounded-bl-md border bg-white text-[var(--navy)]"
                            }`}
                          >
                            {message.subject && (
                              <div
                                className={`mb-2 text-xs font-semibold ${
                                  mine ? "text-white/75" : "text-muted-foreground"
                                }`}
                              >
                                {message.subject}
                              </div>
                            )}
                            <div className="whitespace-pre-wrap break-words">{message.body}</div>
                          </div>
                          <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                            <button
                              type="button"
                              onClick={() => deleteMessage(message)}
                              disabled={savingId === message.id}
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-red-600 opacity-100 transition hover:bg-red-50 disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100"
                            >
                              <Trash2 className="size-3.5" />
                              Delete
                            </button>
                          </div>
                        </div>
                        {mine && <UserAvatar name={profile.name} email={profile.email} size={34} />}
                      </div>
                    );
                  })
                ) : (
                  <EmptyState text="No messages with this person yet. Send the first message below." />
                )}
              </div>

              <div className="border-t bg-card p-4 sm:p-5">
                <div className="grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
                  <div className="space-y-2">
                    <Label>Subject</Label>
                    <Input
                      value={subject}
                      onChange={(event) => setSubject(event.target.value)}
                      placeholder={selectedConversation?.latest.subject || "New message"}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Message</Label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Textarea
                        rows={3}
                        value={body}
                        onChange={(event) => setBody(event.target.value)}
                        placeholder={`Message ${personLabel(selectedPerson)}`}
                        className="min-h-[120px] flex-1"
                      />
                      <Button
                        onClick={sendMessage}
                        disabled={sending}
                        className="bg-[var(--navy)] text-white hover:bg-[var(--navy-light)] sm:self-end"
                      >
                        <Send className="size-4" />
                        {sending ? "Sending..." : "Send"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[680px] items-center justify-center p-6">
              <EmptyState text="Choose a recipient to start messaging." />
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
