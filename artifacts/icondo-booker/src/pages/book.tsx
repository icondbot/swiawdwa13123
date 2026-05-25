import { useState } from "react";
import {
  useGetUpcomingSlots,
  useGetSettings,
  useAttemptCustomBooking,
  getGetUpcomingSlotsQueryKey,
  getGetBookingStatsQueryKey,
  getListBookingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Clock, Loader2, Zap, CalendarClock } from "lucide-react";

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

type Result = { success: boolean; queued?: boolean; message: string } | null;

export default function Book() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [result, setResult] = useState<Result>(null);

  const { data: slots, isLoading: slotsLoading } = useGetUpcomingSlots({ query: { refetchInterval: 30_000 } });
  const { data: settingsRaw } = useGetSettings();
  const settings = settingsRaw as unknown as { bookingTimeSlot: string } | undefined;

  const defaultSlot = settings?.bookingTimeSlot ?? "16:00";
  const [timeSlot, setTimeSlot] = useState<string | null>(null);
  const effectiveSlot = timeSlot ?? defaultSlot;

  const attempt = useAttemptCustomBooking();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetUpcomingSlotsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetBookingStatsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey() });
  };

  const activeDate = selectedDate ?? slots?.[0]?.date ?? null;
  const activeSlot = slots?.find(s => s.date === activeDate);

  const alreadyBooked = activeSlot?.booking?.status === "success";
  const alreadyQueued = activeSlot?.booking?.status === "pending";
  const windowOpen    = activeSlot?.isBookingOpen ?? false;

  const handleBook = () => {
    if (!activeDate) return;
    setResult(null);
    attempt.mutate({ data: { date: activeDate, timeSlot: effectiveSlot } }, {
      onSuccess: (res) => {
        const r = res as typeof res & { queued?: boolean };
        setResult({ success: r.success, queued: r.queued, message: r.message });
        toast({
          title: r.success ? "Booked!" : r.queued ? "Queued!" : "Could not book",
          description: r.message,
          variant: r.success || r.queued ? "default" : "destructive",
        });
        invalidate();
      },
      onError: () => {
        setResult({ success: false, message: "Could not reach server." });
        toast({ title: "Error", description: "Could not reach server", variant: "destructive" });
      },
    });
  };

  return (
    <div className="space-y-5 max-w-sm">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Book</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Pick a Sunday and time — books immediately if the window is open, or queues it to fire the moment it opens.
        </p>
      </div>

      {/* Time slot picker */}
      <div className="space-y-1.5">
        <Label className="text-sm">Time slot</Label>
        <Select value={effectiveSlot} onValueChange={(v) => { setTimeSlot(v); setResult(null); }}>
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

      {/* Sunday selector */}
      {slotsLoading ? (
        <div className="grid grid-cols-2 gap-2">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {slots?.map(slot => {
            const isSelected = slot.date === activeDate;
            const isBooked   = slot.booking?.status === "success";
            const isQueued   = slot.booking?.status === "pending";
            const label = new Date(slot.date + "T00:00:00+08:00").toLocaleDateString("en-SG", {
              day: "numeric", month: "short", timeZone: "Asia/Singapore",
            });
            return (
              <button
                key={slot.date}
                onClick={() => { setSelectedDate(slot.date); setResult(null); }}
                className={`relative rounded-xl border p-3 text-left transition-all
                  ${isSelected
                    ? "border-primary bg-primary/8 shadow-sm"
                    : "border-border bg-background hover:border-primary/40 hover:bg-primary/3"
                  }`}
              >
                <p className="text-sm font-semibold text-foreground">{label}</p>
                <p className="text-xs text-primary font-medium mt-0.5">{fmt12(effectiveSlot)}</p>
                <p className={`text-[10px] mt-1 font-medium
                  ${isBooked ? "text-emerald-600" : isQueued ? "text-amber-600" : slot.isBookingOpen ? "text-emerald-500" : "text-muted-foreground"}`}>
                  {isBooked ? "✓ Booked" : isQueued ? "⏳ Queued" : slot.isBookingOpen ? "Window open" : "Queues at midnight"}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {/* Action card */}
      {activeSlot && (
        <Card className={alreadyBooked ? "border-emerald-200 bg-emerald-50/50" : ""}>
          <CardContent className="pt-5 pb-5 space-y-4">
            <div className="text-center">
              <p className="font-semibold text-foreground">
                {new Date(activeSlot.date + "T00:00:00+08:00").toLocaleDateString("en-SG", {
                  weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Singapore",
                })}
              </p>
              <p className="text-2xl font-bold text-primary mt-1">{fmt12(effectiveSlot)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Tennis Court · Sky@eleven</p>
            </div>

            {alreadyBooked ? (
              <div className="flex items-center justify-center gap-2 text-emerald-700 font-medium text-sm">
                <CheckCircle2 className="w-4 h-4" />
                Already booked for this Sunday
              </div>
            ) : (
              <>
                <Button
                  size="lg"
                  onClick={handleBook}
                  disabled={attempt.isPending || alreadyQueued}
                  className="w-full gap-2 text-base"
                >
                  {attempt.isPending ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> {windowOpen ? "Booking..." : "Queuing..."}</>
                  ) : alreadyQueued ? (
                    <><Clock className="w-5 h-5" /> Already queued</>
                  ) : windowOpen ? (
                    <><Zap className="w-5 h-5" /> Book Now</>
                  ) : (
                    <><CalendarClock className="w-5 h-5" /> Queue — auto-books at midnight</>
                  )}
                </Button>

                {!windowOpen && !alreadyQueued && (
                  <p className="text-xs text-center text-muted-foreground">
                    Window opens{" "}
                    {new Date(activeSlot.opensAt).toLocaleDateString("en-SG", {
                      weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Singapore",
                    })}{" "}
                    at midnight SGT. Queuing it means the bot grabs it the instant that happens.
                  </p>
                )}
              </>
            )}

            {result && (
              <div className={`flex items-start gap-2.5 p-3 rounded-lg border text-sm
                ${result.success
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : result.queued
                  ? "bg-blue-50 border-blue-200 text-blue-800"
                  : "bg-amber-50 border-amber-200 text-amber-800"
                }`}
              >
                {result.success
                  ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  : result.queued
                  ? <CalendarClock className="w-4 h-4 mt-0.5 shrink-0" />
                  : <Clock className="w-4 h-4 mt-0.5 shrink-0" />
                }
                <span>{result.message}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
