import { db } from "@workspace/db";
import { bookingsTable, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

let lastRunAt: Date | null = null;
let isRunning = false;

// ─────────────────────────────────────────────────────────────────────────────
// iCondo MOBILE API — reverse-engineered from the Android APK
//
//   Base URL:  https://services.icondo.asia/api/v1   (mobile host; web host
//              api.icondo.asia returns 108004 "management disabled access")
//   Auth:      Authorization: Bearer <ICONDO_TOKEN>   (long-lived, expires 2028)
//   Required headers:
//     device-os:   androidResident
//     app-version: 1.0.0
//     condo-id:    <ICONDO_CONDO_ID>
//     unit-id:     <ICONDO_UNIT_ID>
//
//   Booking flow:
//     1. GET  /facility/{facId}/slots-available?date=<ISO date>
//     2. POST /booking/validate?excluded=wysiwyg
//     3. POST /booking?excluded=wysiwyg
// ─────────────────────────────────────────────────────────────────────────────

const ICONDO_API_BASE    = process.env.ICONDO_API_BASE    ?? "https://services.icondo.asia/api/v1";
const ICONDO_CONDO_ID    = process.env.ICONDO_CONDO_ID    ?? "7f2280c3-4165-4e92-94c6-6c8123d354fa";
const ICONDO_UNIT_ID     = process.env.ICONDO_UNIT_ID     ?? "f11d99a6-fc92-45d3-8b55-9572c926faf9";
const ICONDO_FACILITY_ID = process.env.ICONDO_FACILITY_ID ?? "658cb71b-23e7-40c2-b78d-3a38c200b8f5";
const ICONDO_SLOT_ID     = process.env.ICONDO_SLOT_ID     ?? "bd128926-32bb-44bc-94c2-fde6cbd9e4e4";

function sgtParts(now: Date): { y: number; m: number; d: number; dow: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Singapore",
    year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]));
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    dow: dowMap[parts.weekday as string],
  };
}

function getTargetSundayDate(): string {
  const { y, m, d, dow } = sgtParts(new Date());
  const daysUntilNextSunday = dow === 0 ? 7 : 7 - dow;
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + daysUntilNextSunday);
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}-${String(base.getUTCDate()).padStart(2, "0")}`;
}

function getConfig() {
  return { token: process.env.ICONDO_TOKEN };
}

function buildHeaders(): Record<string, string> {
  const { token } = getConfig();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "device-os": "androidResident",
    "app-version": "1.0.0",
    "condo-id": ICONDO_CONDO_ID,
    "unit-id": ICONDO_UNIT_ID,
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

type Duration = { id: string; isAvailable: boolean; slotTimeId: string; startTime: string; stopTime: string };
type SlotTime = { id: string; durations?: Duration[] };
type Slot     = { id: string; name: string; slotTime?: SlotTime[] };

// ── Low-level: find the duration ID for a slot (no DB, no side effects) ──────
async function findDurationId(
  date: string,
  timeSlot: string,
): Promise<{ ok: true; durationId: string; startTime: string; stopTime: string } | { ok: false; message: string }> {
  const dateIso = `${date}T00:00:00.000Z`;
  const url = `${ICONDO_API_BASE}/facility/${ICONDO_FACILITY_ID}/slots-available?date=${encodeURIComponent(dateIso)}`;
  const res  = await fetch(url, { headers: buildHeaders() });
  const data = await res.json() as unknown;

  if (!res.ok) return { ok: false, message: `Failed to fetch slots (${res.status}): ${JSON.stringify(data)}` };

  const slots = data as Slot[];
  const slot  = slots.find(s => s.id === ICONDO_SLOT_ID);
  if (!slot) {
    return {
      ok: false,
      message: `Slot ${ICONDO_SLOT_ID} not found for ${date} (got: ${slots.map(s => s.name).join(", ")})`,
    };
  }

  const targetStart = `${timeSlot.padStart(5, "0")}:00`;
  for (const st of slot.slotTime ?? []) {
    for (const dur of st.durations ?? []) {
      if (dur.startTime === targetStart) {
        if (!dur.isAvailable) return { ok: false, message: `Slot ${timeSlot} on ${date} is not available (already booked or outside booking window)` };
        return { ok: true, durationId: dur.id, startTime: dur.startTime, stopTime: dur.stopTime };
      }
    }
  }
  return { ok: false, message: `Could not find ${timeSlot} duration for ${date}` };
}

// ── Low-level: call iCondo once, return result (no DB writes) ─────────────────
async function callICondoOnce(
  date: string,
  timeSlot: string,
): Promise<{ success: boolean; message: string; startTime?: string; endTime?: string }> {
  try {
    const found = await findDurationId(date, timeSlot);
    if (!found.ok) {
      logger.warn({ date, timeSlot, reason: found.message }, "Duration lookup failed");
      return { success: false, message: found.message };
    }

    const dateIso = `${date}T00:00:00.000Z`;

    const valRes = await fetch(`${ICONDO_API_BASE}/booking/validate?excluded=wysiwyg`, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify({
        date: dateIso,
        listDurationId: [found.durationId],
        timezone: "Asia/Singapore",
        guestMetaData: { hasGuestList: false, maxGuestNumber: -1, guestList: [] },
        bookingAddons: [],
        noteToManagement: "",
      }),
    });
    const valData = await valRes.json() as Record<string, unknown>;
    if (!valRes.ok) {
      return { success: false, message: `Validate failed (${valRes.status}): ${valData.message ?? JSON.stringify(valData)}` };
    }

    const startTime = found.startTime.slice(0, 5);
    const endTime   = found.stopTime.slice(0, 5);

    const bookRes = await fetch(`${ICONDO_API_BASE}/booking?excluded=wysiwyg`, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify({
        date: dateIso,
        startTime,
        endTime,
        listDurationId: [found.durationId],
        bookingAddons: [],
        guestListMetadata: { hasGuestList: false, maxGuestNumber: -1, guestList: [] },
        note: "",
        noteToManagement: "",
        amount: "0", paymentAmount: "0", depositAmount: "0",
        paidAmount: "0", topupAmount: "0", totalAmount: "0",
        cardToken: "",
      }),
    });
    const bookData = await bookRes.json() as Record<string, unknown>;

    if (bookRes.ok && !bookData.code) {
      logger.info({ id: bookData.id }, "Booking succeeded");
      return { success: true, message: `Booked tennis court for ${date} ${startTime}–${endTime} (id: ${bookData.id ?? "n/a"})`, startTime, endTime };
    }

    const code = bookData.code as number | undefined;
    const msg  = bookData.message as string | undefined;
    if (code === 108004) return { success: false, message: `Booking blocked by management: ${msg}` };
    if (code === 1037)   return { success: false, message: `Slot taken before we could book it: ${msg}` };
    logger.error({ bookData, status: bookRes.status }, "Booking API error");
    return { success: false, message: `Booking failed (${bookRes.status}): ${msg ?? JSON.stringify(bookData)}` };
  } catch (err) {
    logger.error({ err }, "iCondo API threw");
    return { success: false, message: `Network error: ${(err as Error).message}` };
  }
}

// Returns true if the booking window for `date` is currently open (≥7 days away opens at midnight SGT)
export function isWindowOpen(date: string): boolean {
  const { y, m, d } = sgtParts(new Date());
  const todayUTC    = new Date(Date.UTC(y, m - 1, d));
  const windowOpens = new Date(new Date(`${date}T00:00:00.000Z`).getTime() - 7 * 24 * 60 * 60 * 1000);
  return todayUTC >= windowOpens;
}

// Returns the ISO string for when the booking window opens for a given date
export function windowOpensAt(date: string): string {
  return new Date(new Date(`${date}T00:00:00.000Z`).getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
}

// ── Public: smart booking — bursts immediately if window open, queues if not ──
export async function attemptBooking(
  isAuto: boolean,
  customDate?: string,
  customTimeSlot?: string,
): Promise<{ success: boolean; queued?: boolean; message: string; booking?: Record<string, unknown> }> {
  const { token } = getConfig();
  if (!token) return { success: false, message: "ICONDO_TOKEN not configured" };

  const [settings] = await db.select().from(settingsTable).limit(1);
  const timeSlot   = customTimeSlot ?? settings?.bookingTimeSlot ?? "16:00";
  const targetDate = customDate ?? getTargetSundayDate();

  // Already booked?
  const existing = await db.select().from(bookingsTable).where(eq(bookingsTable.date, targetDate));
  const booked   = existing.find(b => b.status === "success" && b.timeSlot === timeSlot);
  if (booked) {
    return { success: true, message: `Court already booked for ${targetDate} at ${timeSlot}`, booking: booked as unknown as Record<string, unknown> };
  }

  if (isWindowOpen(targetDate)) {
    // Window is open — burst-book immediately (single DB record at end)
    if (isRunning) return { success: false, message: "Booking attempt already in progress" };
    isRunning = true;
    lastRunAt = new Date();
    try {
      await burstBook(targetDate, timeSlot, isAuto);
      const updated = await db.select().from(bookingsTable).where(eq(bookingsTable.date, targetDate));
      const rec     = updated.find(b => b.timeSlot === timeSlot && b.status === "success")
                   ?? updated.find(b => b.timeSlot === timeSlot);
      return {
        success: rec?.status === "success",
        message: rec?.notes ?? "Booking attempt complete",
        booking: rec as unknown as Record<string, unknown>,
      };
    } finally {
      isRunning = false;
    }
  } else {
    // Window not open — queue it as a pending record; cron will burst-book when it opens
    const opensAt = windowOpensAt(targetDate);
    const opensLabel = new Date(opensAt).toLocaleDateString("en-SG", {
      weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Singapore",
    });
    // Remove any old pending records for this date/slot before queuing fresh
    const stale = existing.filter(b => b.status === "pending" && b.timeSlot === timeSlot);
    for (const s of stale) await db.delete(bookingsTable).where(eq(bookingsTable.id, s.id));

    const [booking] = await db.insert(bookingsTable).values({
      date: targetDate, timeSlot,
      status: "pending",
      notes: `Queued — will auto-book when window opens ${opensLabel} at midnight SGT`,
      isAutoBooked: isAuto,
    }).returning();

    logger.info({ targetDate, timeSlot, opensAt }, "Booking queued — window not open yet");
    return {
      success: false,
      queued: true,
      message: `Queued! Will automatically book on ${opensLabel} at midnight SGT the moment the window opens.`,
      booking: booking as unknown as Record<string, unknown>,
    };
  }
}

// ── Internal: burst-book — retries for 30s, writes exactly ONE DB record ──────
async function burstBook(
  date: string,
  timeSlot: string,
  isAuto: boolean,
  opts: { keepRetryingOnUnavailable?: boolean } = {},
): Promise<void> {
  // keepRetryingOnUnavailable: when the cron fires right at the SGT-midnight
  // boundary, iCondo can briefly report the slot "not available" because its
  // clock hasn't ticked the window open yet — so we keep hammering until it
  // opens. For on-demand booking from the UI (window already open by our
  // checks), "not available" means the slot is genuinely taken, so we stop fast
  // instead of wasting 30s.
  const { keepRetryingOnUnavailable = false } = opts;
  const deadline = Date.now() + 30_000;
  let attempt    = 0;
  let lastMsg    = "No attempts made";
  let succeeded  = false;

  logger.info({ date, timeSlot, keepRetryingOnUnavailable }, "Burst booking started");

  while (Date.now() < deadline) {
    attempt++;
    const result = await callICondoOnce(date, timeSlot);
    lastMsg = result.message;

    if (result.success) {
      succeeded = true;
      break;
    }

    // "not available" = window not open yet (keep trying) OR slot taken (give
    // up). Only give up on it when we already know the window is open.
    if (!keepRetryingOnUnavailable && result.message.includes("not available")) break;
    if (/management/i.test(result.message)) break;

    await new Promise(r => setTimeout(r, 300));
  }

  logger.info({ date, timeSlot, succeeded, attempts: attempt, message: lastMsg }, "Burst booking done");

  // Write exactly ONE record for the whole burst
  await db.insert(bookingsTable).values({
    date, timeSlot,
    status: succeeded ? "success" : "failed",
    notes: lastMsg,
    isAutoBooked: isAuto,
  });
}


// ── Main scheduling logic ─────────────────────────────────────────────────────
// Processes any manually queued (pending) bookings whose window is now open.
// Auto-booking is intentionally removed — only user-queued bookings are executed.
export async function checkAndBookOpenSlots(): Promise<void> {
  const { y, m, d } = sgtParts(new Date());
  const todayUTC = new Date(Date.UTC(y, m - 1, d));

  // Look back up to 4 weeks and ahead up to 3 weeks for pending bookings
  const allPending = await db.select().from(bookingsTable)
    .where(eq(bookingsTable.status, "pending"));

  for (const q of allPending) {
    const windowOpens = new Date(new Date(`${q.date}T00:00:00.000Z`).getTime() - 7 * 24 * 60 * 60 * 1000);
    const windowIsOpen = todayUTC >= windowOpens;

    if (!windowIsOpen) {
      logger.info({ date: q.date }, "Window not open yet — skipping queued booking");
      continue;
    }

    logger.info({ date: q.date, timeSlot: q.timeSlot }, "Executing queued booking");
    await db.delete(bookingsTable).where(eq(bookingsTable.id, q.id));
    // Cron fires at the exact midnight boundary, so keep retrying through a
    // momentary "not available" while iCondo's window ticks open.
    await burstBook(q.date, q.timeSlot, q.isAutoBooked, { keepRetryingOnUnavailable: true });
  }
}

export function getSchedulerStatus() {
  const { y, m, d, dow } = sgtParts(new Date());
  const daysUntil = dow === 0 ? 7 : 7 - dow;
  const base = new Date(Date.UTC(y, m - 1, d + daysUntil));
  const { token } = getConfig();
  return {
    isRunning,
    nextRunAt: `${base.toISOString().slice(0, 10)}T00:00:00+08:00`,
    lastRunAt: lastRunAt?.toISOString() ?? null,
    autoBookEnabled: true,
    timezone: "Asia/Singapore",
    tokenConfigured: !!token,
    facilityId: ICONDO_FACILITY_ID,
    slotId: ICONDO_SLOT_ID,
    condoId: ICONDO_CONDO_ID,
    credentialsConfigured: !!token,
    appCheckTokenConfigured: true,
    appTokenConfigured: true,
    apiKeyConfigured: true,
  };
}

