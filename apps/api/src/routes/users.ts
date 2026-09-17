import { Router } from "express";
import { changePasswordSchema, updateProfileSchema, updateSettingsSchema } from "@enermesh/shared";
import { ok } from "../lib/response.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { changePassword, getProfile, updateProfile, updateSettings } from "../services/user.service.js";

export const usersRouter = Router();

usersRouter.use(authenticate);

usersRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    const user = await getProfile(req.user!.id);
    return ok(res, { user });
  }),
);

usersRouter.patch(
  "/me",
  validate({ body: updateProfileSchema }),
  asyncHandler(async (req, res) => {
    const user = await updateProfile(req.user!.id, req.body);
    return ok(res, { user });
  }),
);

usersRouter.patch(
  "/me/settings",
  validate({ body: updateSettingsSchema }),
  asyncHandler(async (req, res) => {
    const user = await updateSettings(req.user!.id, req.body);
    return ok(res, { user });
  }),
);

usersRouter.post(
  "/me/password",
  validate({ body: changePasswordSchema }),
  asyncHandler(async (req, res) => {
    const result = await changePassword(req.user!.id, req.body);
    return ok(res, { passwordChanged: true, revokedSessions: result.revokedSessions });
  }),
);
