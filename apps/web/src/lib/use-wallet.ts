"use client";

import { useCallback, useEffect, useState } from "react";
import { getChainConfig } from "./chain";
import {
  describeWalletError,
  ensureChain,
  getInjectedProvider,
  isUserRejected,
  normalizeAddress,
  parseChainId,
  readAccounts,
  readChainId,
  requestAccounts,
  type Eip1193Provider,
} from "./ethereum";

export interface WalletSession {
  hasProvider: boolean | null;
  account: string | null;
  chainId: number | null;
  expectedChainId: number;
  expectedChainName: string;
  onExpectedChain: boolean;
  connecting: boolean;
  switching: boolean;
  error: string | null;
  connect: () => Promise<string>;
  switchToExpectedChain: () => Promise<number>;
  clearError: () => void;
}

export function useWallet(): WalletSession {
  const config = getChainConfig();
  const expectedChainId = config.chainId;
  const expectedChainName = config.chainName;
  const [hasProvider, setHasProvider] = useState<boolean | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sync = useCallback(async (provider: Eip1193Provider) => {
    const accounts = await readAccounts(provider);
    setAccount(accounts[0] ? normalizeAddress(accounts[0]) : null);
    setChainId(await readChainId(provider));
  }, []);

  useEffect(() => {
    const provider = getInjectedProvider();
    setHasProvider(provider !== null);
    if (!provider) return;
    void sync(provider).catch(() => undefined);

    const onAccounts = (...args: unknown[]) => {
      const next = Array.isArray(args[0]) ? (args[0] as string[]) : [];
      setAccount(next[0] ? normalizeAddress(next[0]) : null);
    };
    const onChain = (...args: unknown[]) => {
      setChainId(parseChainId(args[0]));
    };
    provider.on?.("accountsChanged", onAccounts);
    provider.on?.("chainChanged", onChain);
    return () => {
      provider.removeListener?.("accountsChanged", onAccounts);
      provider.removeListener?.("chainChanged", onChain);
    };
  }, [sync]);

  const connect = useCallback(async () => {
    const provider = getInjectedProvider();
    if (!provider) {
      const message = "No browser wallet detected. Install MetaMask or another EIP-1193 wallet.";
      setError(message);
      throw new Error(message);
    }
    setConnecting(true);
    setError(null);
    try {
      const accounts = await requestAccounts(provider);
      const next = accounts[0];
      if (!next) throw new Error("No account was returned by your wallet.");
      const normalized = normalizeAddress(next);
      setAccount(normalized);
      setChainId(await readChainId(provider));
      return normalized;
    } catch (caught) {
      const message = isUserRejected(caught)
        ? "Wallet connection was rejected."
        : describeWalletError(caught);
      setError(message);
      throw caught;
    } finally {
      setConnecting(false);
    }
  }, []);

  const switchToExpectedChain = useCallback(async () => {
    const provider = getInjectedProvider();
    if (!provider) throw new Error("No browser wallet detected.");
    setSwitching(true);
    setError(null);
    try {
      const next = await ensureChain(provider);
      setChainId(next);
      return next;
    } catch (caught) {
      const message = describeWalletError(caught);
      setError(message);
      throw caught;
    } finally {
      setSwitching(false);
    }
  }, []);

  return {
    hasProvider,
    account,
    chainId,
    expectedChainId,
    expectedChainName,
    onExpectedChain: chainId === expectedChainId,
    connecting,
    switching,
    error,
    connect,
    switchToExpectedChain,
    clearError: () => setError(null),
  };
}
