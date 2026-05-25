import { Router, type IRouter } from "express";
import { attemptBooking, getSchedulerStatus } from "../lib/scheduler";

const router: IRouter = Router();

router.get("/scheduler/status", async (_req, res): Promise<void> => {
  const status = getSchedulerStatus();
  res.json(status);
});

router.post("/scheduler/trigger", async (req, res): Promise<void> => {
  req.log.info("Manual booking trigger requested");
  const result = await attemptBooking(false);
  res.json(result);
});

export default router;
