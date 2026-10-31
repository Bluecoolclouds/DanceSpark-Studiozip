import { Router, type IRouter } from "express";
import healthRouter from "./health";
import adminRouter from "./admin";
import videoGenerationsRouter from "./video-generations";
import accountRouter from "./account";
import danceTemplateMediaRouter from "./dance-template-media";
import adminTemplateMediaRouter from "./admin-template-media";
import catalogueRouter from "./catalogue";
import authRouter from "./auth";
import privacyPolicyRouter from "./privacy-policy";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(catalogueRouter);
router.use(danceTemplateMediaRouter);
router.use(adminTemplateMediaRouter);
router.use(adminRouter);
router.use(videoGenerationsRouter);
router.use(accountRouter);
router.use(privacyPolicyRouter);

export default router;
