import { Router, type IRouter } from "express";
import healthRouter from "./health";
import phishingRouter from "./phishing";

const router: IRouter = Router();

router.use(healthRouter);
router.use(phishingRouter);

export default router;
