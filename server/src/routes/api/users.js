import { Router } from "express";
import auth from "../auth.js";

const router = Router();

router.get("/user", auth.required, function (req, res, next) {
  return res.json({ msg: "xd" });
});

export default router;
