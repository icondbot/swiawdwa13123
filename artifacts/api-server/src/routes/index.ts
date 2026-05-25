import { Router, type IRouter } from "express";
import healthRouter from "./health";
import bookingsRouter from "./bookings";
import settingsRouter from "./settings";
import schedulerRouter from "./scheduler";

const router: IRouter = Router();

router.use(healthRouter);
router.use(bookingsRouter);
router.use(settingsRouter);
router.use(schedulerRouter);

export default router;
