import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, settingsTable } from "@workspace/db";
import { UpdateSettingsBody } from "@workspace/api-zod";

const router: IRouter = Router();

async function getOrCreateSettings() {
  const existing = await db.select().from(settingsTable).limit(1);
  if (existing.length > 0) return existing[0];
  const [created] = await db.insert(settingsTable).values({
    autoBookEnabled: true,
    courtName: "Tennis Court",
    bookingTimeSlot: "16:00",
  }).returning();
  return created;
}

function getConfigStatus() {
  return {
    tokenConfigured:    !!process.env.ICONDO_TOKEN,
    facilityId:         process.env.ICONDO_FACILITY_ID ?? "658cb71b-23e7-40c2-b78d-3a38c200b8f5",
    condoId:            process.env.ICONDO_CONDO_ID   ?? "7f2280c3-4165-4e92-94c6-6c8123d354fa",
    username:           process.env.ICONDO_USERNAME ?? null,
  };
}

router.get("/settings", async (_req, res): Promise<void> => {
  const settings = await getOrCreateSettings();
  res.json({
    id: settings.id,
    ...getConfigStatus(),
    autoBookEnabled: settings.autoBookEnabled,
    courtName: settings.courtName,
    bookingTimeSlot: settings.bookingTimeSlot,
    createdAt: settings.createdAt.toISOString(),
    updatedAt: settings.updatedAt.toISOString(),
  });
});

router.put("/settings", async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const settings = await getOrCreateSettings();

  const updates: Partial<{
    autoBookEnabled: boolean;
    courtName: string;
    bookingTimeSlot: string;
  }> = {};

  if (parsed.data.autoBookEnabled !== undefined) updates.autoBookEnabled = parsed.data.autoBookEnabled;
  if (parsed.data.courtName !== undefined) updates.courtName = parsed.data.courtName;
  if (parsed.data.bookingTimeSlot !== undefined) updates.bookingTimeSlot = parsed.data.bookingTimeSlot;

  const [updated] = await db.update(settingsTable)
    .set(updates)
    .where(eq(settingsTable.id, settings.id))
    .returning();

  res.json({
    id: updated.id,
    ...getConfigStatus(),
    autoBookEnabled: updated.autoBookEnabled,
    courtName: updated.courtName,
    bookingTimeSlot: updated.bookingTimeSlot,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  });
});

export default router;
