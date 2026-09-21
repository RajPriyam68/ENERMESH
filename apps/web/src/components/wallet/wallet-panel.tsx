"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, apiRequest } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { describeWalletError, ensureChain, getInjectedProvider } from "@/lib/ethereum";

const EXPECTED_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 80002);
const EXPECTED_CHAIN_NAME = process.env.NEXT_PUBLIC_CHAIN_NAME ?? "Polygon Amoy";

interface WalletRecord {
  id: string;
  address: string;
  chainId: number;
  isPrimary: boolean;
  isVerified: boolean;
  verifiedAt: string | null;
}

interface WalletsResponse {
  wallets: WalletRecord[];
}

interface NonceResponse {
  address: string;
  chainId: number;
  nonce: string;
  message: string;
  expiresAt: string;
}

type PanelError = { message: string; retryable: boolean } | null;

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function WalletPanel() {
  const token = useAuthStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const [hasProvider, setHasProvider] = useState<boolean | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [panelError, setPanelError] = useState<PanelError>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    setHasProvider(getInjectedProvider() !== null);
  }, []);

  const walletsQuery = useQuery<WalletsResponse>({
    queryKey: ["wallets", token],
    queryFn: () => apiRequest<WalletsResponse>("/wallets", { token }),
    enabled: Boolean(token),
  });

  const refreshAccount = useCallback(async () => {
    const provider = getInjectedProvider();
    if (!provider) return;
    const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
    setAccount(accounts[0] ?? null);
    const hexChain = (await provider.request({ method: "eth_chainId" })) as string;
    setChainId(Number.parseInt(hexChain, 16));
  }, []);

  useEffect(() => {
    if (hasProvider) void refreshAccount();
  }, [hasProvider, refreshAccount]);

  const verifyMutation = useMutation({
    mutationFn: async () => {
      const provider = getInjectedProvider();
      if (!provider) throw new Error("No browser wallet detected.");

      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      const address = accounts[0];
      if (!address) throw new Error("No account was returned by your wallet.");
      setAccount(address);

      const hexChain = (await provider.request({ method: "eth_chainId" })) as string;
      const activeChainId = Number.parseInt(hexChain, 16);
      setChainId(activeChainId);

      const challenge = await apiRequest<NonceResponse>("/wallets/nonce", {
        method: "POST",
        token,
        body: { address, chainId: activeChainId },
      });

      const signature = (await provider.request({
        method: "personal_sign",
        params: [challenge.message, address],
      })) as string;

      await apiRequest("/wallets/verify", {
        method: "POST",
        token,
        body: { address, signature, nonce: challenge.nonce },
      });
    },
    onSuccess: async () => {
      setPanelError(null);
      setStatusMessage("Wallet ownership verified. The signature was checked server-side.");
      await queryClient.invalidateQueries({ queryKey: ["wallets"] });
    },
    onError: (error: unknown) => {
      setStatusMessage(null);
      if (error instanceof ApiError) {
        setPanelError({
          message: error.message,
          retryable: ["NONCE_EXPIRED", "NONCE_MISSING", "SIGNATURE_INVALID"].includes(error.code),
        });
        return;
      }
      setPanelError({ message: describeWalletError(error), retryable: true });
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: (address: string) =>
      apiRequest(`/wallets/${address}`, { method: "DELETE", token }),
    onSuccess: async () => {
      setPanelError(null);
      setStatusMessage("Wallet unlinked.");
      await queryClient.invalidateQueries({ queryKey: ["wallets"] });
    },
    onError: (error: unknown) =>
      setPanelError({
        message: error instanceof Error ? error.message : "Unable to unlink the wallet.",
        retryable: false,
      }),
  });

  const switchNetwork = async () => {
    const provider = getInjectedProvider();
    if (!provider) return;
    try {
      await ensureChain(provider);
      await refreshAccount();
    } catch (error) {
      setPanelError({ message: describeWalletError(error), retryable: true });
    }
  };

  const wallets = walletsQuery.data?.wallets ?? [];

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Wallet</h2>
        <p className="text-sm text-muted">
          Linking a wallet only proves you control the address. It does not move funds and costs no gas.
        </p>
      </div>

      {hasProvider === false ? (
        <Alert tone="info">
          No browser wallet detected. Install MetaMask (or another EIP-1193 wallet) to link an address.
        </Alert>
      ) : null}

      {chainId !== null && chainId !== EXPECTED_CHAIN_ID ? (
        <Alert tone="warning" role="alert">
          <p>
            Your wallet is on chain ID {chainId}. EnerMesh expects {EXPECTED_CHAIN_NAME} (
            {EXPECTED_CHAIN_ID}).
          </p>
          <Button variant="outline" size="sm" className="mt-2" onClick={switchNetwork}>
            Switch network
          </Button>
        </Alert>
      ) : null}

      {panelError ? (
        <Alert tone="error" role="alert" title="Wallet verification failed">
          <p>{panelError.message}</p>
          {panelError.retryable ? <p className="mt-1">You can retry the signature request.</p> : null}
        </Alert>
      ) : null}

      {statusMessage ? (
        <Alert tone="success" role="status">
          {statusMessage}
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => verifyMutation.mutate()} disabled={verifyMutation.isPending || !token}>
          {verifyMutation.isPending ? "Waiting for wallet..." : "Connect and verify wallet"}
        </Button>
        {account ? <span className="text-sm text-muted">Active account: {shortAddress(account)}</span> : null}
      </div>

      {walletsQuery.isLoading ? <Spinner label="Loading linked wallets" /> : null}

      {walletsQuery.isError ? (
        <Alert tone="error" role="alert">
          Unable to load linked wallets. Please retry.
        </Alert>
      ) : null}

      {!walletsQuery.isLoading && wallets.length === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-card p-4 text-sm text-muted">
          No wallet linked yet.
        </p>
      ) : null}

      {wallets.length > 0 ? (
        <ul className="divide-y divide-border rounded-md border border-border bg-card">
          {wallets.map((wallet) => (
            <li key={wallet.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <div>
                <p className="font-mono text-sm">{wallet.address}</p>
                <p className="text-xs text-muted">
                  Chain {wallet.chainId} ·{" "}
                  {wallet.isVerified && wallet.verifiedAt
                    ? `Verified ${new Date(wallet.verifiedAt).toLocaleString()}`
                    : "Not verified"}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => unlinkMutation.mutate(wallet.address)}
                disabled={unlinkMutation.isPending}
              >
                Unlink
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
