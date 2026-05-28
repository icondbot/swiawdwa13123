import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarClock, CheckCircle2, AlertCircle, Lock, ExternalLink } from "lucide-react";

const TIME_SLOT_RE = /^\d{2}:\d{2}$/;

const settingsSchema = z.object({
  bookingTimeSlot: z.string().regex(TIME_SLOT_RE, "Must be HH:MM format (e.g. 16:00)"),
});

type SettingsForm = z.infer<typeof settingsSchema>;

interface SettingsData {
  id: number;
  tokenConfigured: boolean;
  facilityId: string;
  condoId: string;
  bookingTimeSlot: string;
}

function StatusRow({
  label, secretKey, ok, okLabel, pendingLabel,
}: {
  label: string; secretKey: string; ok: boolean; okLabel: string; pendingLabel: string;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-muted/40 border border-border">
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-mono text-foreground/80">{secretKey}</span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      {ok ? (
        <span className="text-xs font-medium text-emerald-600 flex items-center gap-1 shrink-0">
          <CheckCircle2 className="w-3.5 h-3.5" /> {okLabel}
        </span>
      ) : (
        <span className="text-xs text-amber-600 flex items-center gap-1 shrink-0 max-w-[180px] text-right">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {pendingLabel}
        </span>
      )}
    </div>
  );
}

export default function Settings() {
  const { data: settingsRaw, isLoading } = useGetSettings();
  const settings = settingsRaw as unknown as SettingsData | undefined;
  const updateSettings = useUpdateSettings();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: { bookingTimeSlot: "16:00" },
  });

  useEffect(() => {
    if (settings) {
      form.reset({ bookingTimeSlot: settings.bookingTimeSlot });
    }
  }, [settings, form]);

  const onSubmit = (values: SettingsForm) => {
    updateSettings.mutate(
      { data: values as Parameters<typeof updateSettings.mutate>[0]["data"] },
      {
        onSuccess: () => {
          toast({ title: "Settings saved" });
          queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
        },
        onError: () => toast({ title: "Error", description: "Could not save settings", variant: "destructive" }),
      }
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-5 max-w-lg">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const tokenOk = settings?.tokenConfigured ?? false;

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Integration status and booking preferences</p>
      </div>

      {/* Status banner */}
      <Card className={tokenOk ? "border-emerald-200 bg-emerald-50/40" : "border-amber-200 bg-amber-50/40"}>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            {tokenOk
              ? <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
              : <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            }
            <div>
              <p className={`text-sm font-medium ${tokenOk ? "text-emerald-700" : "text-amber-700"}`}>
                {tokenOk ? "Ready" : "Setup incomplete"}
              </p>
              <p className={`text-xs mt-0.5 ${tokenOk ? "text-emerald-600" : "text-amber-600"}`}>
                {tokenOk
                  ? "Connected to iCondo. Queued bookings will fire at midnight SGT."
                  : "Set ICONDO_TOKEN in your Render environment variables to finish setup."}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Secrets */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Lock className="w-4 h-4 text-primary" />
            API Secrets
          </CardTitle>
          <CardDescription className="text-xs">
            Stored as{" "}
            <a href="https://dashboard.render.com" target="_blank" rel="noopener noreferrer"
              className="underline underline-offset-2 inline-flex items-center gap-0.5">
              Render environment variables
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
            {" "}— never in the database or code.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <StatusRow
            label="Mobile-app bearer token (long-lived, expires ~2028)"
            secretKey="ICONDO_TOKEN"
            ok={tokenOk}
            okLabel="Configured"
            pendingLabel="Not set — add to Render env vars"
          />
          {settings?.facilityId && (
            <div className="pt-2 border-t border-border space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Identifiers (Sky@eleven)</p>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Facility ID</span>
                <span className="font-mono text-foreground/70 truncate max-w-[200px]">{settings.facilityId}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Condo ID</span>
                <span className="font-mono text-foreground/70 truncate max-w-[200px]">{settings.condoId}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preferences */}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-primary" />
                Booking Preferences
              </CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="bookingTimeSlot"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default Time Slot</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="16:00" />
                    </FormControl>
                    <FormDescription className="text-xs">
                      24-hour format, e.g. <code className="bg-muted px-1 rounded text-[11px]">16:00</code> for 4 PM.
                      Used as the default when booking.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Button type="submit" disabled={updateSettings.isPending} className="w-full">
            {updateSettings.isPending ? "Saving…" : "Save Settings"}
          </Button>
        </form>
      </Form>
    </div>
  );
}
