import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_authenticated/holidays")({
  component: () => (
    <div className="space-y-2">
      <h1 className="text-2xl font-bold tracking-tight">Holidays</h1>
      <p className="text-sm text-muted-foreground">Import public holidays — coming up next.</p>
    </div>
  ),
});
