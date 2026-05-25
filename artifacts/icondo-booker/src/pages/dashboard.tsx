import { useState, useEffect } from "react";
import {
  useGetUpcomingSlots,
  useGetBookingStats,
  useGetSchedulerStatus,
  useGetSettings,
  useTriggerScheduler,
  getGetUpcomingSlotsQueryKey,
  getGetBookingStatsQueryKey,
  getGetSchedulerStatusQueryKey,
  getListBookingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2, XCircle, Clock, Zap, CalendarCheck, TrendingUp,
  AlertCircle, CalendarPlus, AlertTriangle,
} from "lucide-react";
import { Link } from "wouter";

function getNextSundayMidnightSGT(): Date {
  const sgtDateStr = new Date().toLocaleDateString("sv", { timeZone: "Asia/Singapore" });
  const [y, m, d] = sgtDateStr.split("-").map(Number);
  const sgtDayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const daysUntilSunday = sgtDayOfWeek === 0 ? 7 : 7 - sgtDayOfWeek;
  const target = new Date(Date.UTC(y, m - 1, d + daysUntilSunday));
  const ty = target.getUTCFullYear();
  const tm = String(target.getUTCMonth() + 1).padStart(2, "0");
  const td = String(target.getUTCDate()).padStart(2, "0");
  return new Date(`${ty}-${tm}-${td}T00:00:00+08:00`);
}

function useCountdown(target: Date) {
  const [diff, setDiff] = useState(() => target.getTime() - Date.now());
  useEffect(() => {
    const id = setInterval(() => setDiff(target.getTime() - Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);
  const total = Math.max(0, diff);
  const days    = Math.floor(total / 86400000);
  const hours   = Math.floor((total % 86400000) / 3600000);
  const minutes = Math.floor((total % 3600000) / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  return { days, hours, minutes, seconds, isDue: total === 0 };
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string; icon: typeof CheckCircle2 }> = {
    success:   { label: "Booked",    className: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
    failed:    { label: "Failed",    className: "bg-red-100 text-red-700 border-red-200",             icon: XCircle },
    pending:   { label: "Queued",    className: "bg-amber-100 text-amber-700 border-amber-200",       icon: Clock },
    cancelled: { label: "Cancelled", className: "bg-gray-100 text-gray-600 border-gray-200",          icon: XCircle },
  };
  const config = map[status] ?? map.pending;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${config.className}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}

export default function Dashboard() {
  const { data: slots,     isLoading: slotsLoading  } = useGetUpcomingSlots({ query: { refetchInterval: 30_000 } });
  const { data: stats,     isLoading: statsLoading  } = useGetBookingStats({ query: { refetchInterval: 30_000 } });
  const { data: scheduler                            } = useGetSchedulerStatus({ query: { refetchInterval: 30_000 } });
  const { data: settingsRaw                          } = useGetSettings({ query: { refetchInterval: 60_000 } });
  const settings = settingsRaw as unknown as { autoBookEnabled: boolean; bookingTimeSlot: string } | undefined;

  const trigger = useTriggerScheduler();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const nextWindowTarget = getNextSundayMidnightSGT();
  const countdown = useCountdown(nextWindowTarget);

  const nextSundayLabel = nextWindowTarget.toLocaleDateString("en-SG", {
    weekday: "long", day: "numeric", month: "long",
    timeZone: "Asia/Singapore",
  });

  const configuredSlot = settings?.bookingTimeSlot ?? "16:00";
  const autoEnabled = settings?.autoBookEnabled ?? true;

  const handleTrigger = () => {
    trigger.mutate({}, {
      onSuccess: (result) => {
        const r = result as typeof result & { queued?: boolean };
        toast({
          title: r.success ? "Booking successful!" : r.queued ? "Queued!" : "Booking attempted",
          description: r.message,
          variant: r.success || r.queued ? "default" : "destructive",
        });
        queryClient.invalidateQueries({ queryKey: getGetUpcomingSlotsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetBookingStatsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetSchedulerStatusQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey() });
      },
      onError: () => {
        toast({ title: "Error", description: "Could not trigger booking", variant: "destructive" });
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Sundays at {configuredSlot} · auto-books at midnight SGT
          </p>
        </div>
        <Link href="/book">
          <Button size="sm" variant="outline" className="gap-2">
            <CalendarPlus className="w-4 h-4" />
            Book custom
          </Button>
        </Link>
      </div>

      {/* Auto-booking disabled warning */}
      {settings && !autoEnabled && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-700">Auto-booking is disabled</p>
                <p className="text-xs text-amber-600 mt-0.5">
                  The scheduler will not automatically book Sunday slots. Manual bookings and queued slots are unaffected.{" "}
                  <Link href="/settings" className="underline underline-offset-2">Enable in Settings →</Link>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Countdown card */}
      <Card className="border-primary/25 bg-gradient-to-br from-primary/8 to-primary/3 overflow-hidden">
        <CardContent className="pt-5 pb-5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            {countdown.isDue ? "Booking window is open now!" : "Next booking window opens in"}
          </p>
          {countdown.isDue ? (
            <p className="text-lg font-semibold text-primary">
              Window is open — the bot is booking right now.
            </p>
          ) : (
            <div className="flex items-end gap-1">
              {[
                { value: countdown.days,    label: "days" },
                { value: countdown.hours,   label: "hrs"  },
                { value: countdown.minutes, label: "min"  },
                { value: countdown.seconds, label: "sec"  },
              ].map(({ value, label }, i) => (
                <div key={label} className="flex items-end gap-1">
                  {i > 0 && <span className="text-2xl font-light text-primary/40 mb-0.5">:</span>}
                  <div className="text-center min-w-[2.5rem]">
                    <div className="text-4xl font-bold text-primary tabular-nums leading-none">
                      {String(value).padStart(2, "0")}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wide">{label}</div>
                  </div>
                </div>
              ))}
              <div className="ml-auto text-right pb-1">
                <p className="text-xs font-medium text-foreground">{nextSundayLabel}</p>
                <p className="text-xs text-muted-foreground">00:00 SGT</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats row */}
      {statsLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-5"><Skeleton className="h-12 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { value: stats.total,       label: "Total",       color: "text-foreground"  },
            { value: stats.successful,  label: "Successful",  color: "text-emerald-600" },
            { value: stats.failed,      label: "Failed",      color: "text-red-500"     },
            { value: `${stats.successRate}%`, label: "Success rate", color: "text-primary", icon: TrendingUp },
          ].map(({ value, label, color, icon: Icon }) => (
            <Card key={label}>
              <CardContent className="pt-5 pb-4">
                <div className={`text-2xl font-bold ${color}`}>{value}</div>
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  {Icon && <Icon className="w-3 h-3" />}
                  {label}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {/* Upcoming Sundays */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <CalendarCheck className="w-4 h-4 text-primary" />
            Upcoming Sundays
          </h2>
          <Button
            size="sm"
            onClick={handleTrigger}
            disabled={trigger.isPending}
            className="gap-1.5 h-8 text-xs"
          >
            <Zap className="w-3.5 h-3.5" />
            {trigger.isPending ? "Booking..." : "Book Next Sunday"}
          </Button>
        </div>

        <div className="space-y-2">
          {slotsLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}><CardContent className="pt-4"><Skeleton className="h-12 w-full" /></CardContent></Card>
            ))
          ) : slots && slots.length > 0 ? (
            slots.map((slot) => (
              <Card
                key={slot.date}
                className={`transition-all ${slot.booking?.status === "success" ? "border-emerald-200 bg-emerald-50/40" : ""}`}
              >
                <CardContent className="py-3.5 px-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        {new Date(slot.date + "T00:00:00+08:00").toLocaleDateString("en-SG", {
                          weekday: "long", month: "short", day: "numeric",
                          timeZone: "Asia/Singapore",
                        })}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {slot.timeSlot} &middot;{" "}
                        {slot.isBookingOpen ? (
                          <span className="text-emerald-600 font-medium">Window open</span>
                        ) : (
                          <span>
                            Opens{" "}
                            {new Date(slot.opensAt).toLocaleDateString("en-SG", {
                              weekday: "short", day: "numeric", month: "short",
                              timeZone: "Asia/Singapore",
                            })}{" "}
                            at midnight SGT
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0">
                      {slot.booking ? (
                        <StatusBadge status={slot.booking.status} />
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border bg-muted/50 text-muted-foreground border-border">
                          Not booked
                        </span>
                      )}
                    </div>
                  </div>
                  {slot.booking?.notes && (
                    <p className="text-xs text-muted-foreground mt-1.5 truncate">{slot.booking.notes}</p>
                  )}
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <AlertCircle className="w-7 h-7 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No upcoming slots found</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Scheduler status footer */}
      {scheduler && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1 border-t border-border">
          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${autoEnabled ? "bg-emerald-500" : "bg-amber-400"}`} />
          <span>
            Auto-booking {autoEnabled ? "active" : "disabled"} · fires Sunday midnight SGT
            {scheduler.lastRunAt && (
              <> · Last run {new Date(scheduler.lastRunAt).toLocaleString("en-SG", { timeZone: "Asia/Singapore" })}</>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
