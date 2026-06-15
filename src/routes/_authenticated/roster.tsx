import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/roster")({
  component: () => (
    <Placeholder title="Roster" body="Create and view rosters — coming up next." />
  ),
});

function Placeholder({ title, body }: { title: string; body: string }) {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
