"use client";

import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { explorerTxUrl } from "@/lib/chain";
import type { WalletBlockchainStatus, WalletTxPhase } from "@/lib/ethereum";
import { copyForPhase, settlementHint } from "@/lib/tx-status";

export function TxStatusBanner({
  phase,
  txHash,
  explorerUrl,
  chainName,
  error,
  blockchainTxStatus,
}: {
  phase: WalletTxPhase;
  txHash?: string | null;
  explorerUrl: string;
  chainName: string;
  error?: string | null;
  blockchainTxStatus?: WalletBlockchainStatus | null;
}) {
  const copy = copyForPhase(phase);
  if (!copy && !error) return null;
  const tone = error && phase !== "rejected" ? "error" : (copy?.tone ?? "info");
  const role = tone === "error" || phase === "rejected" ? "alert" : "status";

  return (
    <Alert tone={tone} role={role} title={copy?.title}>
      {copy ? <p>{copy.body}</p> : null}
      {error ? <p className={copy ? "mt-1" : undefined}>{error}</p> : null}
      {phase === "awaiting_signature" || phase === "connecting" || phase === "pending" ? (
        <div className="mt-2">
          <Spinner
            label={
              phase === "pending"
                ? "Waiting for a network receipt"
                : phase === "connecting"
                  ? "Waiting for wallet connection"
                  : "Waiting for wallet confirmation"
            }
          />
        </div>
      ) : null}
      {txHash ? (
        <p className="mt-2 font-mono text-xs break-all">
          tx {txHash}
          {explorerUrl ? (
            <>
              {" · "}
              <a
                href={explorerTxUrl(explorerUrl, txHash)}
                className="underline"
                target="_blank"
                rel="noreferrer"
              >
                View on {chainName} explorer
              </a>
            </>
          ) : null}
        </p>
      ) : null}
      <p className="mt-2 text-xs">
        {settlementHint(blockchainTxStatus ?? null)} Wallet UI never marks a trade CONFIRMED.
      </p>
    </Alert>
  );
}
