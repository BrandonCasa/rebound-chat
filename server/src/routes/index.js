import { Router } from "express";

import api from "./api/index.js";
import live from "./live.js";

const router = Router();

router.use("/live", live);
router.use("/api", api);

export default router;
