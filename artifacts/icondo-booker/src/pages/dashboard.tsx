import { useState } from "react";
import {
  useGetSettings,
  useAttemptCustomBooking,
  useListBookings,
  useDeleteBooking,
  getGetBookingStatsQueryKey,
  getListBookingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CheckCircle2, Clock, Loader2, CalendarClock, XCircle, Trash2 } from "lucide-react";

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

type StatusFilter = "all" | "pending" | "success" | "failed";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  success:   { label: "Booked",    color: "text-emerald-600", icon: CheckCircle2 },
  pending:   { label: "Queued",    color: "text-amber-600",   icon: Clock        },
  failed:    { label: "Failed",    color: "text-red-500",     icon: XCircle      },
  cancelled: { label: "Cancelled", color: "text-muted-foreground", icon: XCircle },
};

export default function Home() {
  const [timeSlot, setTimeSlot] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: settingsRaw } = useGetSettings();
  const settings = settingsRaw as unknown as { bookingTimeSlot: string } | undefined;
  const defaultSlot = settings?.bookingTimeSlot ?? "16:00";
  const effectiveSlot = timeSlot ?? defaultSlot;

  const filterParam = filter !== "all" ? { status: filter as "pending" | "success" | "failed" } : {};
  const { data: bookings, isLoading: bookingsLoading } = useListBookings(filterParam, {
    query: { refetchInterval: 30_000 },
  });

  const attempt = useAttemptCustomBooking();
  const deleteBooking = useDeleteBooking();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetBookingStatsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey() });
  };

  const handleBook = () => {
    if (!date) return;
    attempt.mutate({ data: { date, timeSlot: effectiveSlot } }, {
      onSuccess: (res) => {
        const r = res as typeof res & { queued?: boolean };
        toast({
          title: r.success ? "Booked!" : r.queued ? "Queued!" : "Could not book",
          description: r.message,
          variant: r.success || r.queued ? "default" : "destructive",
        });
        invalidate();
        if (r.success || r.queued) setDate("");
      },
      onError: () => {
        toast({ title: "Error", description: "Could not reach server", variant: "destructive" });
      },
    });
  };

  const confirmDelete = () => {
    if (deleteId == null) return;
    deleteBooking.mutate({ id: deleteId }, {
      onSuccess: () => {
        toast({ title: "Deleted" });
        setDeleteId(null);
        invalidate();
      },
      onError: () => {
        toast({ title: "Error", description: "Could not delete", variant: "destructive" });
        setDeleteId(null);
      },
    });
  };

  const FILTERS: { value: StatusFilter; label: string }[] = [
    { value: "all",     label: "All"    },
    { value: "pending", label: "Queued" },
    { value: "success", label: "Booked" },
    { value: "failed",  label: "Failed" },
  ];

  return (
    <div className="space-y-6 max-w-sm mx-auto">

      {/* Book */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">Book Court</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Books now if the window is open — otherwise queues and fires at midnight SGT.
        </p>
      </div>

      <Card>
        <CardContent className="pt-5 pb-5 space-y-4">
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input
              type="date"
              value={date}
              min={new Date().toISOString().slice(0, 10)}
              onChange={e => setDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Time Slot</Label>
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

          <Button
            size="lg"
            onClick={handleBook}
            disabled={!date || attempt.isPending}
            className="w-full gap-2"
          >
            {attempt.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Booking…</>
            ) : (
              <><CalendarClock className="w-4 h-4" /> Book / Queue</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Booking history */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-semibold text-foreground">Bookings</h2>
          <div className="flex gap-1">
            {FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors
                  ${filter === f.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {bookingsLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-14 bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
        ) : bookings && bookings.length > 0 ? (
          <div className="space-y-2">
            {bookings.map(b => {
              const cfg = STATUS_CONFIG[b.status] ?? STATUS_CONFIG.pending;
              const Icon = cfg.icon;
              return (
                <Card key={b.id}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {new Date(b.date + "T00:00:00").toLocaleDateString("en-SG", {
                            weekday: "short", day: "numeric", month: "short", year: "numeric",
                          })}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">{fmt12(b.timeSlot)}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`flex items-center gap-1 text-xs font-semibold ${cfg.color}`}>
                          <Icon className="w-3.5 h-3.5" />
                          {cfg.label}
                        </span>
                        <button
                          onClick={() => setDeleteId(b.id)}
                          className="text-muted-foreground hover:text-red-500 transition-colors p-1 -mr-1"
                          aria-label="Delete booking"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {b.notes && (
                      <p className="text-xs text-muted-foreground mt-1.5 break-words">{b.notes}</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-10 text-sm text-muted-foreground">
            No bookings yet
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={deleteId != null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this booking?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the record from your history. If it's a queued booking, it will no longer auto-book.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteBooking.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
