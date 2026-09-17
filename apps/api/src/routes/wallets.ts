import { Router } from "express";
import { walletNonceSchema, walletVerifySchema } from "@enermesh/shared";
import { ok } from "../lib/response.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import { HttpError } from "../middleware/errorHandler.js";
import { validate } from "../middleware/validate.js";
import { listWallets, requestWalletNonce, unlinkWallet, verifyWalletSignature } from "../services/wallet.service.js";

export const walletsRouter = Router();

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
  validate({ body: walletNonceSchema }),
  asyncHandler(async (req, res) => {
    const challenge = await requestWalletNonce(req.user!.id, req.body);
    return ok(res, challenge);
  }),
);

walletsRouter.post(
  "/verify",
  validate({ body: walletVerifySchema }),
  asyncHandler(async (req, res) => {
    const wallet = await verifyWalletSignature(req.user!.id, req.body);
    return ok(res, { wallet });
  }),
);

walletsRouter.delete(
  "/:address",
  asyncHandler(async (req, res) => {
    const address = req.params.address;
    if (!address) {
      throw new HttpError(422, "VALIDATION_ERROR", "Wallet address is required");
    }
    const result = await unlinkWallet(req.user!.id, address);
    return ok(res, result);
  }),
);
