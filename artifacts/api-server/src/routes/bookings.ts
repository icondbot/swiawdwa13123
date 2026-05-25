import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, bookingsTable } from "@workspace/db";
import {
  ListBookingsQueryParams,
  CreateBookingBody,
  GetBookingParams,
  UpdateBookingParams,
  UpdateBookingBody,
  DeleteBookingParams,
  AttemptCustomBookingBody,
} from "@workspace/api-zod";
import { attemptBooking } from "../lib/scheduler";

const router: IRouter = Router();

router.get("/bookings", async (req, res): Promise<void> => {
  const parsed = ListBookingsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const limit = parsed.data.limit ?? 50;

  // Apply status filter in the DB query so LIMIT doesn't cut filtered results
  const bookings = parsed.data.status
    ? await db.select().from(bookingsTable)
        .where(eq(bookingsTable.status, parsed.data.status))
        .orderBy(desc(bookingsTable.createdAt))
        .limit(limit)
    : await db.select().from(bookingsTable)
        .orderBy(desc(bookingsTable.createdAt))
        .limit(limit);

  const response = bookings.map(b => ({
    id: b.id,
    date: b.date,
    timeSlot: b.timeSlot,
    status: b.status,
    notes: b.notes ?? null,
    isAutoBooked: b.isAutoBooked,
    createdAt: b.createdAt.toISOString(),
  }));

  res.json(response);
});

router.post("/bookings", async (req, res): Promise<void> => {
  const parsed = CreateBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [booking] = await db.insert(bookingsTable).values({
    date: parsed.data.date,
    timeSlot: parsed.data.timeSlot,
    status: "pending",
    notes: parsed.data.notes ?? null,
    isAutoBooked: parsed.data.isAutoBooked ?? false,
  }).returning();

  res.status(201).json({
    id: booking.id,
    date: booking.date,
    timeSlot: booking.timeSlot,
    status: booking.status,
    notes: booking.notes ?? null,
    isAutoBooked: booking.isAutoBooked,
    createdAt: booking.createdAt.toISOString(),
  });
});

router.post("/bookings/attempt", async (req, res): Promise<void> => {
  const parsed = AttemptCustomBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const result = await attemptBooking(false, parsed.data.date, parsed.data.timeSlot);
  res.json(result);
});

router.get("/bookings/upcoming", async (_req, res): Promise<void> => {
  const slots = [];

  // Use explicit SGT timezone for date arithmetic — never rely on server local time
  const sgtDateStr = new Date().toLocaleDateString("sv", { timeZone: "Asia/Singapore" });
  const [sy, sm, sd] = sgtDateStr.split("-").map(Number);
  const sgtDayOfWeek = new Date(Date.UTC(sy, sm - 1, sd)).getUTCDay();
  const daysUntilFirstSunday = sgtDayOfWeek === 0 ? 7 : 7 - sgtDayOfWeek;

  for (let i = 0; i < 4; i++) {
    const target = new Date(Date.UTC(sy, sm - 1, sd + daysUntilFirstSunday + i * 7));
    const ty = target.getUTCFullYear();
    const tm = String(target.getUTCMonth() + 1).padStart(2, "0");
    const td = String(target.getUTCDate()).padStart(2, "0");
    const dateStr = `${ty}-${tm}-${td}`;

    // Window opens at midnight SGT (UTC+8) 7 days before the play date
    const openDate = new Date(Date.UTC(ty, target.getUTCMonth(), target.getUTCDate() - 7));
    const oy = openDate.getUTCFullYear();
    const om = String(openDate.getUTCMonth() + 1).padStart(2, "0");
    const od = String(openDate.getUTCDate()).padStart(2, "0");
    const opensAt = `${oy}-${om}-${od}T00:00:00+08:00`;

    const isBookingOpen = new Date() >= new Date(opensAt);

    const existingBookings = await db.select().from(bookingsTable)
      .where(eq(bookingsTable.date, dateStr));

    // Prefer the successful booking record for this date if one exists
    const booking = existingBookings.find(b => b.status === "success")
      ?? existingBookings.find(b => b.status === "pending")
      ?? existingBookings[0]
      ?? null;

    slots.push({
      date: dateStr,
      timeSlot: "16:00",
      dayOfWeek: "Sunday",
      isBookingOpen,
      opensAt,
      booking: booking ? {
        id: booking.id,
        date: booking.date,
        timeSlot: booking.timeSlot,
        status: booking.status,
        notes: booking.notes ?? null,
        isAutoBooked: booking.isAutoBooked,
        createdAt: booking.createdAt.toISOString(),
      } : undefined,
    });
  }

  res.json(slots);
});

router.get("/bookings/stats", async (_req, res): Promise<void> => {
  const all = await db.select().from(bookingsTable);
  const total = all.length;
  const successful = all.filter(b => b.status === "success").length;
  const failed = all.filter(b => b.status === "failed").length;
  const pending = all.filter(b => b.status === "pending").length;
  const successRate = total > 0 ? Math.round((successful / total) * 100) : 0;

  res.json({ total, successful, failed, pending, successRate });
});

router.get("/bookings/:id", async (req, res): Promise<void> => {
  const params = GetBookingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [booking] = await db.select().from(bookingsTable)
    .where(eq(bookingsTable.id, params.data.id));

  if (!booking) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  res.json({
    id: booking.id,
    date: booking.date,
    timeSlot: booking.timeSlot,
    status: booking.status,
    notes: booking.notes ?? null,
    isAutoBooked: booking.isAutoBooked,
    createdAt: booking.createdAt.toISOString(),
  });
});

router.patch("/bookings/:id", async (req, res): Promise<void> => {
  const params = UpdateBookingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Partial<{ status: string; notes: string }> = {};
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;

  const [booking] = await db.update(bookingsTable)
    .set(updates)
    .where(eq(bookingsTable.id, params.data.id))
    .returning();

  if (!booking) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  res.json({
    id: booking.id,
    date: booking.date,
    timeSlot: booking.timeSlot,
    status: booking.status,
    notes: booking.notes ?? null,
    isAutoBooked: booking.isAutoBooked,
    createdAt: booking.createdAt.toISOString(),
  });
});

router.delete("/bookings/:id", async (req, res): Promise<void> => {
  const params = DeleteBookingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [booking] = await db.delete(bookingsTable)
    .where(eq(bookingsTable.id, params.data.id))
    .returning();

  if (!booking) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
