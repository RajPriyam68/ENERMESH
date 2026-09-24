import { randomUUID } from "node:crypto";
import type { Server as HttpServer } from "node:http";
import type {
  BidChangedPayload,
  BidPublic,
  DashboardUpdatedPayload,
  ListingChangedPayload,
  ListingPublic,
  MatchChangedPayload,
  MatchPublic,
  NotificationPublic,
  SocketEnvelope,
  SystemHelloPayload,
  TradeChangedPayload,
  TradePublic,
} from "@enermesh/shared";
import { SOCKET_EVENTS } from "@enermesh/shared";
import { Server, type Socket } from "socket.io";
import { env } from "../config/env.js";
import { verifyAccessToken } from "../lib/jwt.js";
import { prisma } from "../lib/prisma.js";

const MARKETPLACE_ROOM = "marketplace";
const SYSTEM_HELLO = "system:hello";

let ioRef: Server | null = null;

export function getSocketServer(): Server | null {
  return ioRef;
}

function envelope<T>(data: T): SocketEnvelope<T> {
  return {
    eventId: randomUUID(),
    occurredAt: new Date().toISOString(),
    data,
  };
}

function userRoom(userId: string): string {
  return `user:${userId}`;
}

function uniqueIds(ids: Array<string | null | undefined>): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

function emitToRooms(rooms: string[], event: string, data: unknown): void {
  const io = ioRef;
  if (!io || rooms.length === 0) return;
  try {
    const uniqueRooms = [...new Set(rooms)];
    io.to(uniqueRooms).emit(event, envelope(data));
  } catch {
    // Realtime is advisory; REST already committed.
  }
}

/**
 * Server-authored emit only. Failures never throw so REST remains the source of truth.
 */
export function emitToUsers(userIds: Array<string | null | undefined>, event: string, data: unknown): void {
  emitToRooms(uniqueIds(userIds).map(userRoom), event, data);
}

export function emitToMarketplace(event: string, data: unknown): void {
  emitToRooms([MARKETPLACE_ROOM], event, data);
}

function emitListingToMarketplaceAndSeller(event: string, listing: ListingPublic): void {
  const payload: ListingChangedPayload = { listingId: listing.id, listing };
  emitToRooms([MARKETPLACE_ROOM, userRoom(listing.sellerId)], event, payload);
  emitDashboard([listing.sellerId], { reason: "listing", listingId: listing.id });
}

export function emitListingCreated(listing: ListingPublic): void {
  emitListingToMarketplaceAndSeller(SOCKET_EVENTS.listingCreated, listing);
}

export function emitListingUpdated(listing: ListingPublic): void {
  emitListingToMarketplaceAndSeller(SOCKET_EVENTS.listingUpdated, listing);
}

export function emitListingExpired(listing: ListingPublic): void {
  emitListingToMarketplaceAndSeller(SOCKET_EVENTS.listingExpired, listing);
}

export function emitBidCreated(bid: BidPublic): void {
  const payload: BidChangedPayload = { bid };
  emitToUsers([bid.buyerId], SOCKET_EVENTS.bidCreated, payload);
  emitDashboard([bid.buyerId], { reason: "bid", bidId: bid.id });
}

export function emitBidUpdated(bid: BidPublic): void {
  const payload: BidChangedPayload = { bid };
  emitToUsers([bid.buyerId], SOCKET_EVENTS.bidUpdated, payload);
  emitDashboard([bid.buyerId], { reason: "bid", bidId: bid.id });
}

export function emitBidMatched(bid: BidPublic, extraUserIds: string[] = []): void {
  const payload: BidChangedPayload = { bid };
  emitToUsers([bid.buyerId, ...extraUserIds], SOCKET_EVENTS.bidMatched, payload);
}

export function emitBidExpired(bid: BidPublic): void {
  const payload: BidChangedPayload = { bid };
  emitToUsers([bid.buyerId], SOCKET_EVENTS.bidExpired, payload);
  emitDashboard([bid.buyerId], { reason: "bid", bidId: bid.id });
}

export function emitMatchCreated(match: MatchPublic): void {
  const payload: MatchChangedPayload = { match };
  emitToUsers([match.buyerId, match.sellerId], SOCKET_EVENTS.matchCreated, payload);
  emitDashboard([match.buyerId, match.sellerId], { reason: "match", matchId: match.id, listingId: match.listingId, bidId: match.bidId });
}

export function emitMatchUpdated(match: MatchPublic): void {
  const payload: MatchChangedPayload = { match };
  emitToUsers([match.buyerId, match.sellerId], SOCKET_EVENTS.matchUpdated, payload);
  emitDashboard([match.buyerId, match.sellerId], { reason: "match", matchId: match.id, listingId: match.listingId, bidId: match.bidId });
}

export function emitTradeEvent(trade: TradePublic): void {
  const payload: TradeChangedPayload = { trade };
  let event: string = SOCKET_EVENTS.tradePending;
  if (trade.status === "CONFIRMED" || trade.status === "COMPLETED") {
    event = SOCKET_EVENTS.tradeConfirmed;
  } else if (trade.status === "FAILED" || trade.status === "REJECTED") {
    event = SOCKET_EVENTS.tradeFailed;
  }
  emitToUsers([trade.buyerId, trade.sellerId], event, payload);
  emitDashboard([trade.buyerId, trade.sellerId], {
    reason: "trade",
    tradeId: trade.id,
    matchId: trade.matchId,
  });
}

export function emitNotification(userId: string, notification: NotificationPublic): void {
  emitToUsers([userId], SOCKET_EVENTS.notificationNew, notification);
}

export function emitDashboard(userIds: Array<string | null | undefined>, payload: DashboardUpdatedPayload): void {
  emitToUsers(userIds, SOCKET_EVENTS.dashboardUpdated, payload);
}

export function createSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    path: env.SOCKET_PATH,
    cors: {
      origin: env.NODE_ENV === "test" ? true : env.SOCKET_CORS_ORIGIN.split(",").map((s) => s.trim()),
      credentials: true,
    },
  });
  ioRef = io;

  /**
   * Realtime channels are per-user plus a shared marketplace room.
   * The handshake token must be a valid access token for an active account.
   * Clients never emit privileged marketplace state.
   */
  io.use(async (socket, next) => {
    const raw =
      (socket.handshake.auth?.token as string | undefined) ??
      (typeof socket.handshake.headers.authorization === "string"
        ? socket.handshake.headers.authorization.replace(/^Bearer\s+/i, "")
        : undefined);

    if (!raw) {
      return next(new Error("UNAUTHENTICATED"));
    }

    try {
      const payload = verifyAccessToken(raw);
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, role: true, isActive: true },
      });
      if (!user || !user.isActive) {
        return next(new Error("UNAUTHENTICATED"));
      }
      socket.data.user = { id: user.id, email: user.email, role: user.role };
      socket.join(userRoom(user.id));
      socket.join(MARKETPLACE_ROOM);
      return next();
    } catch {
      return next(new Error("UNAUTHENTICATED"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const user = socket.data.user as { id: string; role: string };
    const hello: SystemHelloPayload = {
      service: "enermesh",
      sprint: "S5",
      userId: user.id,
      message: "Realtime channel ready. Privileged events are server-emitted only.",
    };
    socket.emit(SYSTEM_HELLO, hello);

    socket.onAny(() => {
      // Ignore client-originated events. Privileged state is server-authored.
    });
  });

  return io;
}
