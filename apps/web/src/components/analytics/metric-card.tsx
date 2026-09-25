import type { LabelledMetric } from "@enermesh/shared";

function formatMetric(metric: LabelledMetric): string {
  if (metric.value === null || Number.isNaN(metric.value)) return "—";
  if (metric.unit === "share") {
    return `${Math.round(metric.value * 1000) / 10}%`;
  }
  return `${metric.value.toLocaleString(undefined, { maximumFractionDigits: 3 })} ${metric.unit}`;
}

export function MetricCard({ title, metric }: { title: string; metric: LabelledMetric }) {
  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted">{title}</p>
      <p className="mt-1 text-xl font-semibold">{formatMetric(metric)}</p>
      <p className="mt-1 text-xs text-muted">
        {metric.sourceLabel} · {metric.dataQuality}
      </p>
      <p className="mt-2 text-xs text-muted">{metric.note}</p>
    </article>
  );
}
