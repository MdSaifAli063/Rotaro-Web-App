import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { fetchProfile, type Profile } from "@/lib/auth";
import { RosterList } from "./roster";

export const Route = createFileRoute("/_authenticated/roster/templates")({
  component: RosterTemplatesRoute,
});

function RosterTemplatesRoute() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    fetchProfile().then(setProfile);
  }, []);

  if (!profile?.business_id) return null;

  return (
    <RosterList
      businessId={profile.business_id}
      onOpen={(id) => navigate({ to: "/roster/edit/$id" as any, params: { id } as any })}
    />
  );
}
