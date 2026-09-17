/**
 * Canonical wallet challenge message. The server issues this exact text; the
 * client signs it verbatim with the wallet key. Rebuilding it from stored
 * fields must produce the same string or verification fails.
 */
export function buildWalletChallenge(input: {
  address: string;
  nonce: string;
  chainId: number;
  issuedAt: Date;
}): string {
  return [
    "EnerMesh wallet verification",
    "",
    "Sign this message to prove you control this wallet.",
    "This signature does not trigger a blockchain transaction and costs no gas.",
    "",
    `Address: ${input.address}`,
    `Chain ID: ${input.chainId}`,
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt.toISOString()}`,
  ].join("\n");
}
