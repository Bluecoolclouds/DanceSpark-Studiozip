import { Router, type IRouter } from "express";
import healthRouter from "./health";
import adminRouter from "./admin";
import videoGenerationsRouter from "./video-generations";
import accountRouter from "./account";
import danceTemplateMediaRouter from "./dance-template-media";
import adminTemplateMediaRouter from "./admin-template-media";

const router: IRouter = Router();

router.use(healthRouter);
router.use(danceTemplateMediaRouter);
router.use(adminTemplateMediaRouter);
router.use(adminRouter);
router.use(videoGenerationsRouter);
router.use(accountRouter);

export default router;
