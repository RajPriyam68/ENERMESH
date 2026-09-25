import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, describe, it } from "node:test";
import { io as connectSocket, type Socket } from "socket.io-client";
import { SOCKET_EVENTS } from "@enermesh/shared";
import { Wallet } from "ethers";
import { api, pingDatabase, prisma, uniqueEmail } from "./helpers.js";

const { createApp } = await import("../app.js");
const { createSocketServer } = await import("../socket/index.js");

const dbReady = await pingDatabase();

const app = createApp();
const httpServer = createServer(app);
createSocketServer(httpServer);
await new Promise<void>((resolve) => httpServer.listen(0, resolve));
const { port } = httpServer.address() as AddressInfo;
const baseUrl = `http://127.0.0.1:${port}`;
const createdUserIds: string[] = [];

after(async () => {
  if (dbReady) {
    await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.listing.deleteMany({ where: { sellerId: { in: createdUserIds } } });
    await prisma.auditLog.updateMany({ where: { userId: { in: createdUserIds } }, data: { userId: null } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  await prisma.$disconnect();
});

async function register(role: "BUYER" | "SELLER") {
  const email = uniqueEmail(`rt-${role.toLowerCase()}`);
  const res = await api<{ user: { id: string }; tokens: { accessToken: string } }>(baseUrl, "/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password: "StrongPass123", displayName: `${role} Realtime`, role }),
  });
  assert.equal(res.status, 201);
  createdUserIds.push(res.body.data!.user.id);
  return { userId: res.body.data!.user.id, token: res.body.data!.tokens.accessToken };
}

async function verifyWallet(token: string) {
  const wallet = Wallet.createRandom();
  const nonceRes = await api<{ message: string; nonce: string }>(baseUrl, "/wallets/nonce", {
    method: "POST",
    token,
    body: JSON.stringify({ address: wallet.address }),
  });
  const signature = await wallet.signMessage(nonceRes.body.data!.message);
  const verify = await api(baseUrl, "/wallets/verify", {
    method: "POST",
    token,
    body: JSON.stringify({ address: wallet.address, signature, nonce: nonceRes.body.data!.nonce }),
  });
  assert.equal(verify.status, 200);
}

function openSocket(token?: string): Socket {
  return connectSocket(baseUrl, {
    path: "/socket.io",
    transports: ["websocket", "polling"],
    auth: token ? { token } : {},
    reconnection: false,
    timeout: 5_000,
  });
}

function waitForConnect(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("socket connect timeout")), 5_000);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function waitForEvent<T>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), 5_000);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

describe("socket handshake", () => {
  it("rejects connections without an access token", async () => {
    const socket = openSocket();
    await assert.rejects(waitForConnect(socket), (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      return message.includes("UNAUTHENTICATED");
    });
    socket.disconnect();
  });

  it("rejects connections with a refresh-shaped garbage token", async () => {
    const socket = openSocket("not-a-jwt");
    await assert.rejects(waitForConnect(socket), (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      return message.includes("UNAUTHENTICATED");
    });
    socket.disconnect();
  });
});

describe("socket and notifications", { skip: !dbReady }, () => {
  it("sends system:hello after a valid access token handshake", async () => {
    const seller = await register("SELLER");
    const socket = openSocket(seller.token);
    const hello = waitForEvent<{ sprint: string; userId: string; service: string }>(socket, "system:hello");
    await waitForConnect(socket);
    const payload = await hello;
    assert.equal(payload.service, "enermesh");
    assert.equal(payload.sprint, "S6");
    assert.equal(payload.userId, seller.userId);
    socket.disconnect();
  });

  it("emits listing:created only after a validated write and ignores client emits", async () => {
    const seller = await register("SELLER");
    const buyer = await register("BUYER");
    await verifyWallet(seller.token);

    const sellerSocket = openSocket(seller.token);
    const buyerSocket = openSocket(buyer.token);
    await Promise.all([waitForConnect(sellerSocket), waitForConnect(buyerSocket)]);

    const sellerEvent = waitForEvent<{ eventId: string; data: { listingId: string } }>(
      sellerSocket,
      SOCKET_EVENTS.listingCreated,
    );
    const buyerEvent = waitForEvent<{ eventId: string; data: { listingId: string } }>(
      buyerSocket,
      SOCKET_EVENTS.listingCreated,
    );

    sellerSocket.emit(SOCKET_EVENTS.listingCreated, { listingId: "client-forged" });
    await new Promise((resolve) => setTimeout(resolve, 200));

    const from = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const created = await api<{ listing: { id: string } }>(baseUrl, "/listings", {
      method: "POST",
      token: seller.token,
      body: JSON.stringify({
        energyType: "SOLAR",
        availableKwh: 50,
        minTradeKwh: 5,
        maxTradeKwh: 20,
        pricePerKwh: 0.11,
        location: "Austin TX",
        marketZone: "ERCOT-WEST",
        availableFrom: from,
        availableUntil: until,
      }),
    });
    assert.equal(created.status, 201);
    const listingId = created.body.data!.listing.id;

    const sellerPayload = await sellerEvent;
    const buyerPayload = await buyerEvent;
    assert.equal(sellerPayload.data.listingId, listingId);
    assert.equal(buyerPayload.data.listingId, listingId);
    assert.notEqual(sellerPayload.eventId, "");
    assert.notEqual(sellerPayload.data.listingId, "client-forged");

    const sellerNotes = await api<{ notifications: Array<{ type: string }>; unreadCount: number }>(
      baseUrl,
      "/notifications",
      { token: seller.token },
    );
    assert.equal(sellerNotes.status, 200);
    assert.equal(sellerNotes.body.data!.unreadCount >= 1, true);
    assert.equal(
      sellerNotes.body.data!.notifications.some((row) => row.type === "LISTING_CREATED"),
      true,
    );

    const buyerNotes = await api<{ notifications: Array<{ type: string }>; unreadCount: number }>(
      baseUrl,
      "/notifications",
      { token: buyer.token },
    );
    assert.equal(buyerNotes.status, 200);
    assert.equal(
      buyerNotes.body.data!.notifications.some((row) => row.type === "LISTING_CREATED"),
      false,
    );

    sellerSocket.disconnect();
    buyerSocket.disconnect();
  });

  it("requires auth for notification list and mark-read", async () => {
    const unauth = await api(baseUrl, "/notifications");
    assert.equal(unauth.status, 401);

    const seller = await register("SELLER");
    const missing = await api(baseUrl, "/notifications/00000000-0000-4000-8000-000000000001/read", {
      method: "POST",
      token: seller.token,
    });
    assert.equal(missing.status, 404);
  });
});
