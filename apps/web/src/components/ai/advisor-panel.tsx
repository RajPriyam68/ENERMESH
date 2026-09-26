"use client";

import type { AiInsight, AiInsightRequest } from "@enermesh/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, apiRequest } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { buildAiInsightRequest, type AiInsightResponse, type AiPanelQuery } from "@/lib/ai";

function FactsStrip({ insight }: { insight: AiInsight }) {
  const analytics = insight.facts.analytics;
  const rec = insight.facts.recommendation;
  return (
    <dl className="grid gap-3 rounded-md border border-dashed border-border bg-background p-3 text-xs sm:grid-cols-2">
      <div>
        <dt className="uppercase tracking-wide text-muted">Confirmed kWh (ACTUAL)</dt>
        <dd className="mt-1 font-medium">{analytics?.energyTradedKwh ?? 0}</dd>
      </div>
      <div>
        <dt className="uppercase tracking-wide text-muted">Avg price (ACTUAL)</dt>
        <dd className="mt-1 font-medium">{analytics?.averagePricePerKwh ?? "—"}</dd>
      </div>
      <div>
        <dt className="uppercase tracking-wide text-muted">Live supply / demand (ACTUAL)</dt>
        <dd className="mt-1 font-medium">
          {analytics?.supplyKwh ?? 0} / {analytics?.demandKwh ?? 0} kWh
        </dd>
      </div>
      <div>
        <dt className="uppercase tracking-wide text-muted">S6 advisory price</dt>
        <dd className="mt-1 font-medium">{rec?.recommendedPrice ?? "none"}</dd>
      </div>
    </dl>
  );
}

export function AdvisorPanel({
  energyType,
  marketZone,
  listingId,
  bidId,
  heading = "EnergyTech advisor",
}: AiPanelQuery & { heading?: string }) {
  const token = useAuthStore((state) => state.accessToken);
  const status = useAuthStore((state) => state.status);
  const [question, setQuestion] = useState("");
  const query: AiPanelQuery = { energyType, marketZone, listingId, bidId };

  const statusQuery = useQuery({
    queryKey: ["ai", "status"],
    enabled: status === "authenticated" && Boolean(token),
    queryFn: async () => {
      const data = await apiRequest<{ status: AiInsightResponse["status"] }>("/ai/status", { token });
      return data.status;
    },
  });

  const insightMutation = useMutation({
    mutationFn: async (topic?: AiInsightRequest["topic"]) => {
      const body = buildAiInsightRequest(query, question, topic);
      return apiRequest<AiInsightResponse>("/ai/insights", { method: "POST", token, body });
    },
  });

  if (status !== "authenticated") {
    return (
      <Alert tone="info">
        Sign in to load an advisory explanation of labelled marketplace facts. Trading still works without AI.
      </Alert>
    );
  }

  const provider = statusQuery.data;
  const result = insightMutation.data;
  const insight = result?.insight;

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Advisory · cannot execute trades</p>
          <h2 className="mt-1 text-lg font-semibold">{heading}</h2>
        </div>
        {statusQuery.isLoading ? <Spinner label="Checking AI adapter" /> : null}
      </div>

      {statusQuery.isError ? (
        <Alert tone="error" role="alert" title="Could not read AI status">
          {statusQuery.error instanceof ApiError ? statusQuery.error.message : "Please retry."}
        </Alert>
      ) : null}

      {provider ? (
        <Alert tone={provider.configured ? "info" : "warning"}>
          {provider.configured
            ? `Provider ${provider.provider ?? "configured"} is available. Output is still advisory and never applied to listings or wallets.`
            : "No AI provider is configured. You still get a deterministic explanation of S6 labelled analytics. Matching and settlement are unchanged."}
        </Alert>
      ) : null}

      <Field
        label="Optional question"
        htmlFor="ai-question"
        hint="Treated as untrusted text. Do not paste secrets. Max 500 characters."
      >
        <Textarea
          id="ai-question"
          maxLength={500}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="e.g. Why is the recommended price empty in this zone?"
        />
      </Field>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => insightMutation.mutate(undefined)} disabled={insightMutation.isPending}>
          Explain these facts
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => insightMutation.mutate("price")} disabled={insightMutation.isPending}>
          Explain price rec
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => insightMutation.mutate("market")} disabled={insightMutation.isPending}>
          Market conditions
        </Button>
      </div>

      {insightMutation.isPending ? <Spinner label="Writing advisory notes" /> : null}

      {insightMutation.isError ? (
        <Alert tone="error" role="alert" title="Could not load advisory notes">
          {insightMutation.error instanceof ApiError ? insightMutation.error.message : "Please retry."}
        </Alert>
      ) : null}

      {insight ? (
        <div className="space-y-3">
          <p className="text-xs text-muted">
            {insight.usedFallback ? "Deterministic S6 fallback" : "Model narrative"} · {insight.sourceLabel} ·{" "}
            {insight.dataQuality} · actions {insight.actionsEnabled ? "enabled" : "disabled"}
          </p>
          <p className="text-sm">{insight.summary}</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            {insight.bullets.map((item, index) => (
              <li key={`${index}-${item.slice(0, 24)}`}>{item}</li>
            ))}
          </ul>
          <FactsStrip insight={insight} />
          <div className="space-y-1 text-xs text-muted">
            {insight.caveats.map((item, index) => (
              <p key={`${index}-${item.slice(0, 24)}`}>{item}</p>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
