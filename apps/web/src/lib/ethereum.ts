export interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
}

interface WindowWithEthereum {
  ethereum?: Eip1193Provider & { isMetaMask?: boolean };
}

export function getInjectedProvider(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  const { ethereum } = window as unknown as WindowWithEthereum;
  return ethereum ?? null;
}

export function chainIdToHex(chainId: number): string {
  return `0x${chainId.toString(16)}`;
}

export function describeWalletError(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const code = (error as { code?: number }).code;
    if (code === 4001) return "Signature request was rejected in your wallet.";
    if (code === -32002) return "Your wallet already has a pending request. Open it and try again.";
    if (code === 4902) return "This network is not configured in your wallet.";
    const message = (error as { message?: string }).message;
    if (message) return message;
  }
  return "Wallet interaction failed. Please try again.";
}
