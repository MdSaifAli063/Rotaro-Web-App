import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_authenticated/reports")({
  component: () => (
    <div className="space-y-2">
      <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
      <p className="text-sm text-muted-foreground">Hours, wages and comparison reports — coming up next.</p>
    </div>
  ),
});
