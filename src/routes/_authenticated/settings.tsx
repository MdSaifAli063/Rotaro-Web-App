import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const [autoApprove, setAutoApprove] = useState(false);
  const [businessId, setBusinessId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: prof } = await supabase.from("profiles").select("business_id").maybeSingle();
      if (prof?.business_id) {
        setBusinessId(prof.business_id);
        const { data } = await supabase
          .from("settings")
          .select("auto_approve_leave")
          .eq("business_id", prof.business_id)
          .maybeSingle();
        if (data) setAutoApprove(data.auto_approve_leave);
      }
    })();
  }, []);

  const update = async (v: boolean) => {
    setAutoApprove(v);
    if (!businessId) return;
    const { error } = await supabase
      .from("settings")
      .upsert({ business_id: businessId, auto_approve_leave: v });
    if (error) toast.error(error.message);
    else toast.success("Settings updated");
  };

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure how your business runs.</p>
      </div>
      <div className="bg-card border rounded-xl p-6 shadow-sm flex items-center justify-between">
        <div>
          <Label className="text-base">Auto-approve leave</Label>
          <p className="text-sm text-muted-foreground mt-1">
            New leave requests are approved automatically.
          </p>
        </div>
        <Switch checked={autoApprove} onCheckedChange={update} />
      </div>
    </div>
  );
}
