import { useState } from "react";
import {
  useGetUpcomingSlots,
  useGetSettings,
  useAttemptCustomBooking,
  useListBookings,
  getGetUpcomingSlotsQueryKey,
  getGetBookingStatsQueryKey,
  getListBookingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Clock, Loader2, Zap, CalendarClock, XCircle } from "lucide-react";

const TIME_OPTIONS = [
  "07:00", "08:00", "09:00", "10:00", "11:00", "12:00",
  "13:00", "14:00", "15:00", "16:00", "17:00", "18:00",
  "19:00", "20:00", "21:00",
];

function fmt12(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

function fmtDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00+08:00").toLocaleDateString("en-SG", {
    weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Singapore",
  });
}

function fmtShort(dateStr: string) {
  return new Date(dateStr + "T00:00:00+08:00").toLocaleDateString("en-SG", {
    weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Singapore",
  });
}

export default function Home() {
  const [timeSlot, setTimeSlot] = useState<string | null>(null);

  const { data: slots, isLoading } = useGetUpcomingSlots({ query: { refetchInterval: 30_000 } });
  const { data: settingsRaw } = useGetSettings();
  const settings = settingsRaw as unknown as { bookingTimeSlot: string } | undefined;
  const defaultSlot = settings?.bookingTimeSlot ?? "16:00";
  const effectiveSlot = timeSlot ?? defaultSlot;

  const { data: recentBookings } = useListBookings({}, { query: { refetchInterval: 60_000 } });

  const attempt = useAttemptCustomBooking();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetUpcomingSlotsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetBookingStatsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey() });
  };

  const nextSlot = slots?.[0] ?? null;
  const isBooked = nextSlot?.booking?.status === "success";
  const isQueued = nextSlot?.booking?.status === "pending";
  const windowOpen = nextSlot?.isBookingOpen ?? false;

  const handleBook = () => {
    if (!nextSlot) return;
    attempt.mutate({ data: { date: nextSlot.date, timeSlot: effectiveSlot } }, {
      onSuccess: (res) => {
        const r = res as typeof res & { queued?: boolean };
        toast({
          title: r.success ? "Booked!" : r.queued ? "Queued!" : "Could not book",
          description: r.message,
          variant: r.success || r.queued ? "default" : "destructive",
        });
        invalidate();
      },
      onError: () => {
        toast({ title: "Error", description: "Could not reach server", variant: "destructive" });
      },
    });
  };

  const recentDone = recentBookings?.filter(b => b.status === "success" || b.status === "failed").slice(0, 3) ?? [];

  return (
    <div className="space-y-5 max-w-sm mx-auto">

      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">Tennis Court</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Sky@eleven · books automatically every Sunday at midnight SGT</p>
      </div>

      {/* Time slot picker */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Time Slot</p>
        <Select value={effectiveSlot} onValueChange={(v) => setTimeSlot(v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIME_OPTIONS.map(t => (
              <SelectItem key={t} value={t}>
                {fmt12(t)}{t === defaultSlot ? " (default)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Next Sunday — main booking card */}
      {isLoading ? (
        <Card><CardContent className="pt-6 pb-6">
          <div className="space-y-3">
            <div className="h-4 w-24 bg-muted rounded animate-pulse mx-auto" />
            <div className="h-6 w-48 bg-muted rounded animate-pulse mx-auto" />
            <div className="h-10 w-full bg-muted rounded animate-pulse" />
          </div>
        </CardContent></Card>
      ) : nextSlot ? (
        <Card className={
          isBooked ? "border-emerald-200 bg-emerald-50/50" :
          isQueued ? "border-amber-200 bg-amber-50/40" : ""
        }>
          <CardContent className="pt-5 pb-5 space-y-4">
            <div className="text-center">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Next Sunday</p>
              <p className="text-base font-semibold text-foreground">{fmtDate(nextSlot.date)}</p>
              <p className="text-3xl font-bold text-primary mt-1">{fmt12(effectiveSlot)}</p>
            </div>

            {/* Booked */}
            {isBooked && (
              <div className="flex flex-col items-center gap-1 py-1">
                <div className="flex items-center gap-2 text-emerald-700 font-semibold text-base">
                  <CheckCircle2 className="w-5 h-5" />
                  Booked!
                </div>
                <p className="text-xs text-muted-foreground">See you Sunday.</p>
              </div>
            )}

            {/* Queued */}
            {isQueued && !isBooked && (
              <div className="flex flex-col items-center gap-1 py-1">
                <div className="flex items-center gap-2 text-amber-700 font-semibold text-sm">
                  <Clock className="w-4 h-4" />
                  Queued
                </div>
                <p className="text-xs text-center text-muted-foreground">
                  Will auto-book when the window opens{" "}
                  {fmtShort(nextSlot.opensAt.slice(0, 10))}{" "}at midnight SGT
                </p>
              </div>
            )}

            {/* Not booked — show button */}
            {!isBooked && !isQueued && (
              <div className="space-y-2">
                <Button
                  size="lg"
                  onClick={handleBook}
                  disabled={attempt.isPending}
                  className="w-full gap-2 text-base"
                >
                  {attempt.isPending ? (
                    <><Loader2 className="w-5 h-5 animate-spin" />{windowOpen ? "Booking…" : "Queuing…"}</>
                  ) : windowOpen ? (
                    <><Zap className="w-5 h-5" />Book Now</>
                  ) : (
                    <><CalendarClock className="w-5 h-5" />Queue — auto-books at midnight</>
                  )}
                </Button>
                {!windowOpen && (
                  <p className="text-xs text-center text-muted-foreground">
                    Window opens {fmtShort(nextSlot.opensAt.slice(0, 10))} at midnight SGT
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Other upcoming Sundays */}
      {slots && slots.length > 1 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Other Sundays</p>
          {slots.slice(1).map(slot => {
            const s = slot.booking?.status;
            const color = s === "success" ? "text-emerald-600" : s === "pending" ? "text-amber-600" : "text-muted-foreground";
            const label = s === "success" ? "✓ Booked" : s === "pending" ? "⏳ Queued" : "Not booked";
            return (
              <div key={slot.date} className="flex items-center justify-between py-1.5 px-1 border-b border-border/50 last:border-0">
                <span className="text-sm text-foreground">{fmtShort(slot.date)}</span>
                <span className={`text-xs font-medium ${color}`}>{label}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Recent completed bookings */}
      {recentDone.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Recent</p>
          {recentDone.map(b => (
            <div key={b.id} className="flex items-center justify-between py-1.5 px-1 border-b border-border/50 last:border-0">
              <span className="text-sm text-foreground">
                {new Date(b.date + "T00:00:00").toLocaleDateString("en-SG", {
                  weekday: "short", day: "numeric", month: "short",
                })}
                <span className="text-muted-foreground"> · {b.timeSlot}</span>
              </span>
              {b.status === "success" ? (
                <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                  <CheckCircle2 className="w-3 h-3" /> Booked
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs font-medium text-red-500">
                  <XCircle className="w-3 h-3" /> Failed
                </span>
              )}
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
