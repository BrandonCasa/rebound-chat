import { Router } from "express";
import api from "./api/index.js";

const router = Router();

router.use("/api", api);
//router.use("/admin", admin_api);

export default router;
