import { useState } from "react";
import { useListBookings, useUpdateBooking, useDeleteBooking, useCreateBooking, getListBookingsQueryKey, getGetBookingStatsQueryKey, getGetUpcomingSlotsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, XCircle, Clock, Plus, Trash2, Edit2, CalendarPlus, Filter } from "lucide-react";

type StatusFilter = "all" | "pending" | "success" | "failed" | "cancelled";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string; icon: typeof CheckCircle2 }> = {
    success: { label: "Booked", className: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: CheckCircle2 },
    failed: { label: "Failed", className: "bg-red-100 text-red-800 border-red-200", icon: XCircle },
    pending: { label: "Pending", className: "bg-amber-100 text-amber-800 border-amber-200", icon: Clock },
    cancelled: { label: "Cancelled", className: "bg-gray-100 text-gray-700 border-gray-200", icon: XCircle },
  };
  const config = map[status] ?? map.pending;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.className}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}

export default function Bookings() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [editBooking, setEditBooking] = useState<{ id: number; status: string; notes: string } | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("16:00");
  const [newNotes, setNewNotes] = useState("");

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const params = statusFilter !== "all" ? { status: statusFilter as "pending" | "success" | "failed" | "cancelled" } : {};
  const { data: bookings, isLoading } = useListBookings(params, { query: { refetchInterval: 30_000 } });

  const createBooking = useCreateBooking();
  const updateBooking = useUpdateBooking();
  const deleteBooking = useDeleteBooking();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListBookingsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetBookingStatsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetUpcomingSlotsQueryKey() });
  };

  const handleCreate = () => {
    if (!newDate) return;
    createBooking.mutate({ data: { date: newDate, timeSlot: newTime, notes: newNotes } }, {
      onSuccess: () => {
        toast({ title: "Booking added" });
        setAddOpen(false);
        setNewDate("");
        setNewNotes("");
        invalidate();
      },
      onError: () => toast({ title: "Error", description: "Could not add booking", variant: "destructive" }),
    });
  };

  const handleUpdateStatus = (id: number, status: string, notes: string) => {
    updateBooking.mutate({ id, data: { status: status as "pending" | "success" | "failed" | "cancelled", notes } }, {
      onSuccess: () => {
        toast({ title: "Booking updated" });
        setEditBooking(null);
        invalidate();
      },
      onError: () => toast({ title: "Error", description: "Could not update booking", variant: "destructive" }),
    });
  };

  const handleDelete = (id: number) => {
    setDeleteId(id);
  };

  const confirmDelete = () => {
    if (deleteId == null) return;
    deleteBooking.mutate({ id: deleteId }, {
      onSuccess: () => {
        toast({ title: "Booking deleted" });
        setDeleteId(null);
        invalidate();
      },
      onError: () => {
        toast({ title: "Error", description: "Could not delete booking", variant: "destructive" });
        setDeleteId(null);
      },
    });
  };

  return (
    <div className="space-y-6" data-testid="bookings-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Booking History</h1>
          <p className="text-sm text-muted-foreground mt-1">All tennis court bookings</p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)} className="gap-2" data-testid="button-add-booking">
          <Plus className="w-4 h-4" />
          Add
        </Button>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-40" data-testid="select-status-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="success">Booked</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{bookings?.length ?? 0} results</span>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : bookings && bookings.length > 0 ? (
        <div className="space-y-3">
          {bookings.map((booking) => (
            <Card key={booking.id} data-testid={`booking-card-${booking.id}`} className="transition-all hover:shadow-sm">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-medium text-foreground" data-testid={`booking-date-${booking.id}`}>
                        {new Date(booking.date + "T00:00:00").toLocaleDateString("en-SG", {
                          weekday: "short", year: "numeric", month: "short", day: "numeric"
                        })}
                      </span>
                      <span className="text-sm text-muted-foreground">{booking.timeSlot}</span>
                      <StatusBadge status={booking.status} />
                      {booking.isAutoBooked && (
                        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">Auto</span>
                      )}
                    </div>
                    {booking.notes && (
                      <p className="text-xs text-muted-foreground mt-1.5 truncate" data-testid={`booking-notes-${booking.id}`}>{booking.notes}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Added {new Date(booking.createdAt).toLocaleDateString("en-SG")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => setEditBooking({ id: booking.id, status: booking.status, notes: booking.notes ?? "" })}
                      data-testid={`button-edit-${booking.id}`}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(booking.id)}
                      data-testid={`button-delete-${booking.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-16 text-center">
            <CalendarPlus className="w-10 h-10 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No bookings yet</p>
            <p className="text-xs text-muted-foreground mt-1">Bookings will appear here after the scheduler runs</p>
            <Button size="sm" variant="outline" onClick={() => setAddOpen(true)} className="mt-4 gap-2">
              <Plus className="w-4 h-4" /> Add manually
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Booking</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="booking-date">Date</Label>
              <Input id="booking-date" type="date" value={newDate} onChange={e => setNewDate(e.target.value)} data-testid="input-booking-date" />
            </div>
            <div>
              <Label htmlFor="booking-time">Time Slot</Label>
              <Input id="booking-time" value={newTime} onChange={e => setNewTime(e.target.value)} placeholder="16:00" data-testid="input-booking-time" />
            </div>
            <div>
              <Label htmlFor="booking-notes">Notes (optional)</Label>
              <Textarea id="booking-notes" value={newNotes} onChange={e => setNewNotes(e.target.value)} placeholder="Any notes..." data-testid="input-booking-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!newDate || createBooking.isPending} data-testid="button-confirm-add">
              {createBooking.isPending ? "Adding..." : "Add Booking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editBooking} onOpenChange={() => setEditBooking(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Booking</DialogTitle>
          </DialogHeader>
          {editBooking && (
            <div className="space-y-4">
              <div>
                <Label>Status</Label>
                <Select value={editBooking.status} onValueChange={v => setEditBooking({ ...editBooking, status: v })}>
                  <SelectTrigger data-testid="select-edit-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="success">Booked</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={editBooking.notes} onChange={e => setEditBooking({ ...editBooking, notes: e.target.value })} data-testid="input-edit-notes" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditBooking(null)}>Cancel</Button>
            <Button
              onClick={() => editBooking && handleUpdateStatus(editBooking.id, editBooking.status, editBooking.notes)}
              disabled={updateBooking.isPending}
              data-testid="button-confirm-edit"
            >
              {updateBooking.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteId != null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete booking?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the booking record. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteBooking.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
