import { Router } from "express";
import { walletAddressParamSchema, walletNonceSchema, walletVerifySchema } from "@enermesh/shared";
import { createLimiter } from "../lib/rateLimit.js";
import { ok } from "../lib/response.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { listWallets, requestWalletNonce, unlinkWallet, verifyWalletSignature } from "../services/wallet.service.js";

export const walletsRouter = Router();

const walletLimiter = createLimiter({
  windowMs: 60_000,
  limit: 20,
  message: "Too many wallet attempts. Try again shortly.",
});

walletsRouter.use(authenticate);

walletsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const wallets = await listWallets(req.user!.id);
    return ok(res, { wallets });
  }),
);

walletsRouter.post(
  "/nonce",
  walletLimiter,
  validate({ body: walletNonceSchema }),
  asyncHandler(async (req, res) => {
    const challenge = await requestWalletNonce(req.user!.id, req.body);
    return ok(res, challenge);
  }),
);

walletsRouter.post(
  "/verify",
  walletLimiter,
  validate({ body: walletVerifySchema }),
  asyncHandler(async (req, res) => {
    const wallet = await verifyWalletSignature(req.user!.id, req.body);
    return ok(res, { wallet });
  }),
);

walletsRouter.delete(
  "/:address",
  validate({ params: walletAddressParamSchema }),
  asyncHandler(async (req, res) => {
    const result = await unlinkWallet(req.user!.id, req.params.address as string);
    return ok(res, result);
  }),
);
