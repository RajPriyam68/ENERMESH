import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { Wallet } from "ethers";
import { api, pingDatabase, prisma, startTestServer, uniqueEmail } from "./helpers.js";

const dbReady = await pingDatabase();
const server = await startTestServer();
const createdUserIds: string[] = [];

after(async () => {
  if (dbReady) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await server.close();
  await prisma.$disconnect();
});

async function authToken(): Promise<string> {
  const email = uniqueEmail("wallet");
  const password = "StrongPass123";
  const res = await api<{ user: { id: string }; tokens: { accessToken: string } }>(
    server.baseUrl,
    "/auth/register",
    { method: "POST", body: JSON.stringify({ email, password, displayName: "Wallet Tester", role: "SELLER" }) },
  );
  assert.equal(res.status, 201);
  createdUserIds.push(res.body.data!.user.id);
  return res.body.data!.tokens.accessToken;
}

describe("wallet verification", { skip: !dbReady }, () => {
  it("issues a challenge, verifies a real signature and lists the wallet", async () => {
    const token = await authToken();
    const wallet = Wallet.createRandom();

    const nonceRes = await api<{ message: string; nonce: string; address: string }>(
      server.baseUrl,
      "/wallets/nonce",
      { method: "POST", token, body: JSON.stringify({ address: wallet.address }) },
    );
    assert.equal(nonceRes.status, 200);
    const { message, nonce } = nonceRes.body.data!;

    const signature = await wallet.signMessage(message);
    const verify = await api<{ wallet: { address: string; isVerified: boolean } }>(
      server.baseUrl,
      "/wallets/verify",
      { method: "POST", token, body: JSON.stringify({ address: wallet.address, signature, nonce }) },
    );
    assert.equal(verify.status, 200);
    assert.equal(verify.body.data!.wallet.isVerified, true);
    assert.equal(verify.body.data!.wallet.address, wallet.address.toLowerCase());

    const list = await api<{ wallets: Array<{ address: string; isVerified: boolean }> }>(
      server.baseUrl,
      "/wallets",
      { token },
    );
    assert.equal(list.status, 200);
    assert.equal(list.body.data!.wallets.length, 1);
    assert.equal(list.body.data!.wallets[0]!.isVerified, true);
  });

  it("rejects a signature from a different wallet", async () => {
    const token = await authToken();
    const wallet = Wallet.createRandom();
    const attacker = Wallet.createRandom();

    const nonceRes = await api<{ message: string; nonce: string }>(server.baseUrl, "/wallets/nonce", {
      method: "POST",
      token,
      body: JSON.stringify({ address: wallet.address }),
    });
    const { message, nonce } = nonceRes.body.data!;
    const signature = await attacker.signMessage(message);

    const verify = await api(server.baseUrl, "/wallets/verify", {
      method: "POST",
      token,
      body: JSON.stringify({ address: wallet.address, signature, nonce }),
    });
    assert.equal(verify.status, 401);
    assert.equal(verify.body.error?.code, "SIGNATURE_INVALID");
  });

  it("rejects a replayed nonce after successful verification", async () => {
    const token = await authToken();
    const wallet = Wallet.createRandom();
    const nonceRes = await api<{ message: string; nonce: string }>(server.baseUrl, "/wallets/nonce", {
      method: "POST",
      token,
      body: JSON.stringify({ address: wallet.address }),
    });
    const { message, nonce } = nonceRes.body.data!;
    const signature = await wallet.signMessage(message);

    const first = await api(server.baseUrl, "/wallets/verify", {
      method: "POST",
      token,
      body: JSON.stringify({ address: wallet.address, signature, nonce }),
    });
    assert.equal(first.status, 200);

    const replay = await api(server.baseUrl, "/wallets/verify", {
      method: "POST",
      token,
      body: JSON.stringify({ address: wallet.address, signature, nonce }),
    });
    assert.equal(replay.status, 409);
  });

  it("rejects a nonce issued to a different account", async () => {
    const ownerToken = await authToken();
    const otherToken = await authToken();
    const wallet = Wallet.createRandom();

    const nonceRes = await api<{ message: string; nonce: string }>(server.baseUrl, "/wallets/nonce", {
      method: "POST",
      token: ownerToken,
      body: JSON.stringify({ address: wallet.address }),
    });
    const { message, nonce } = nonceRes.body.data!;
    const signature = await wallet.signMessage(message);

    const hijack = await api(server.baseUrl, "/wallets/verify", {
      method: "POST",
      token: otherToken,
      body: JSON.stringify({ address: wallet.address, signature, nonce }),
    });
    assert.equal(hijack.status, 403);
    assert.equal(hijack.body.error?.code, "FORBIDDEN");
  });

  it("rejects an invalid address payload with 422", async () => {
    const token = await authToken();
    const res = await api(server.baseUrl, "/wallets/nonce", {
      method: "POST",
      token,
      body: JSON.stringify({ address: "not-an-address" }),
    });
    assert.equal(res.status, 422);
  });

  it("unlinks a wallet", async () => {
    const token = await authToken();
    const wallet = Wallet.createRandom();
    const nonceRes = await api<{ message: string; nonce: string }>(server.baseUrl, "/wallets/nonce", {
      method: "POST",
      token,
      body: JSON.stringify({ address: wallet.address }),
    });
    const { message, nonce } = nonceRes.body.data!;
    const signature = await wallet.signMessage(message);
    await api(server.baseUrl, "/wallets/verify", {
      method: "POST",
      token,
      body: JSON.stringify({ address: wallet.address, signature, nonce }),
    });

    const removed = await api(server.baseUrl, `/wallets/${wallet.address}`, { method: "DELETE", token });
    assert.equal(removed.status, 200);

    const list = await api<{ wallets: unknown[] }>(server.baseUrl, "/wallets", { token });
    assert.equal(list.body.data!.wallets.length, 0);
  });
});
