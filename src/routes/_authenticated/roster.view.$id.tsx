import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { fetchProfile, type Profile } from "@/lib/auth";
import { RosterEditor } from "./roster";

export const Route = createFileRoute("/_authenticated/roster/view/$id")({
  component: RosterViewRoute,
});

function RosterViewRoute() {
  const { id } = Route.useParams() as { id: string };
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    fetchProfile().then(setProfile);
  }, []);

  if (!profile?.business_id) return null;

  return (
    <RosterEditor
      rosterId={id}
      businessId={profile.business_id}
      onBack={() => navigate({ to: "/roster" })}
      readOnly
    />
  );
}
