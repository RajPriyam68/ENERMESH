import { z } from "zod";
import { paginationQuerySchema } from "./common.js";

export const notificationFilterSchema = paginationQuerySchema.extend({
  unreadOnly: z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((value) => value === "true" || value === "1"),
});

export type NotificationFilter = z.infer<typeof notificationFilterSchema>;
