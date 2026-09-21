export interface ChainConfig {
  chainId: number;
  chainName: string;
  rpcUrl: string;
  explorerUrl: string;
  contractAddress: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

function readNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function getChainConfig(): ChainConfig {
  const explorerUrl = trimSlash(process.env.NEXT_PUBLIC_BLOCK_EXPLORER_URL ?? "https://amoy.polygonscan.com");
  const contractAddress = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "").trim();
  return {
    chainId: readNumber(process.env.NEXT_PUBLIC_CHAIN_ID, 80002),
    chainName: process.env.NEXT_PUBLIC_CHAIN_NAME ?? "polygon-amoy",
    rpcUrl: process.env.NEXT_PUBLIC_RPC_URL ?? "https://rpc-amoy.polygon.technology",
    explorerUrl,
    contractAddress,
    nativeCurrency: {
      name: process.env.NEXT_PUBLIC_NATIVE_CURRENCY_NAME ?? "POL",
      symbol: process.env.NEXT_PUBLIC_NATIVE_CURRENCY_SYMBOL ?? "POL",
      decimals: 18,
    },
  };
}

export function isConfiguredContractAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address) && address !== "0x0000000000000000000000000000000000000000";
}

export function explorerTxUrl(explorerUrl: string, txHash: string): string {
  const hash = txHash.startsWith("0x") ? txHash : `0x${txHash}`;
  return `${trimSlash(explorerUrl)}/tx/${hash}`;
}

export function addEthereumChainParams(config: ChainConfig) {
  return {
    chainId: `0x${config.chainId.toString(16)}`,
    chainName: config.chainName,
    nativeCurrency: config.nativeCurrency,
    rpcUrls: [config.rpcUrl],
    blockExplorerUrls: [config.explorerUrl],
  };
}
