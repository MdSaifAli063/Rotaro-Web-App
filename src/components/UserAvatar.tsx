import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

function initialsOf(name: string | null | undefined, email?: string | null) {
  const src = (name || email || "").trim();
  if (!src) return "?";
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export function useSignedAvatarUrl(path?: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!path || path.trim() === "") {
      setUrl(null);
      return;
    }
    if (path.startsWith("http")) {
      setUrl(path);
      return;
    }

    supabase.storage
      .from("avatars")
      .createSignedUrl(path, 60 * 60 * 24)
      .then(({ data, error }) => {
        if (error) {
          console.error("Error generating signed avatar URL:", error.message);
        }
        if (!cancelled) setUrl(data?.signedUrl ?? null);
      });

    return () => {
      cancelled = true;
    };
  }, [path]);
  return [url, setUrl] as const;
}

export function UserAvatar({
  name,
  email,
  avatarPath,
  size = 40,
  className = "",
}: {
  name?: string | null;
  email?: string | null;
  avatarPath?: string | null;
  size?: number;
  className?: string;
}) {
  const [url, setUrl] = useSignedAvatarUrl(avatarPath);
  const initials = initialsOf(name, email);
  const style = { width: size, height: size, fontSize: Math.max(12, size * 0.36) };
  return (
    <div
      style={style}
      className={`rounded-full overflow-hidden shrink-0 inline-flex items-center justify-center font-semibold ${className}`}
    >
      {url ? (
        <img
          src={url}
          alt={name || email || "Avatar"}
          className="w-full h-full object-cover"
          onError={() => setUrl(null)}
        />
      ) : (
        <span
          className="w-full h-full inline-flex items-center justify-center"
          style={{ background: "var(--muted, #EEF1F6)", color: "var(--muted-foreground, #1E2A45)" }}
        >
          {initials}
        </span>
      )}
    </div>
  );
}
