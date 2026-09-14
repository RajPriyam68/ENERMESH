import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About EnerMesh",
};

export default function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-12">
      <h1 className="text-3xl font-semibold">About EnerMesh</h1>
      <p className="text-muted">
        EnerMesh is a B.Tech final-year project: a production-quality peer-to-peer renewable energy
        marketplace. Prosumers list surplus energy; buyers bid; a deterministic backend matcher
        produces partial or full matches; settlement evidence is recorded on an EVM network.
      </p>
      <h2 className="text-xl font-semibold">Research question</h2>
      <p className="text-muted">
        How can a renewable-energy marketplace efficiently match decentralized energy supply and demand
        while providing transparent and independently verifiable digital trade settlement?
      </p>
      <h2 className="text-xl font-semibold">What is measured</h2>
      <ul className="list-disc space-y-1 pl-5 text-muted">
        <li>Matching efficiency, success rate, and time</li>
        <li>Matched versus unmatched volume</li>
        <li>Settlement time, realtime latency, and failure rate</li>
        <li>Recommendation confidence and overselling prevention</li>
      </ul>
      <p className="text-sm text-muted">Metrics are never fabricated. Unavailable series are labelled as such.</p>
    </div>
  );
}
