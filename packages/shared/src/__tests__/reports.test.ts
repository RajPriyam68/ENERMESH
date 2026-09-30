import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DataSourceLabel } from "../enums.js";
import { emptyTelemetryKwh, telemetryKwhFromSamples } from "../reports.js";
import { walletAddressParamSchema } from "../schemas/auth.js";
import { adminUserPatchSchema, adminUserQuerySchema, auditLogQuerySchema } from "../schemas/admin.js";
import { reportQuerySchema } from "../schemas/report.js";

describe("telemetry report helpers", () => {
  it("keeps empty telemetry at actual zero", () => {
    const empty = emptyTelemetryKwh("No samples.");
    assert.equal(empty.value, 0);
    assert.equal(empty.sourceLabel, DataSourceLabel.ACTUAL);
    const none = telemetryKwhFromSamples(0, 0);
    assert.equal(none.value, 0);
    assert.equal(none.sourceLabel, DataSourceLabel.ACTUAL);
  });

  it("does not treat stored kWh as invented marketplace volume", () => {
    const metric = telemetryKwhFromSamples(3.75, 3);
    assert.equal(metric.value, 3.75);
    assert.match(metric.note, /not as marketplace volume/i);
  });
});

describe("admin schemas", () => {
  it("coerces isActive query flags", () => {
    const parsed = adminUserQuerySchema.parse({ page: "1", pageSize: "10", isActive: "true", role: "BUYER" });
    assert.equal(parsed.isActive, true);
    assert.equal(parsed.role, "BUYER");
  });

  it("rejects unknown patch fields and role assignment", () => {
    assert.throws(() => adminUserPatchSchema.parse({ isActive: true, role: "ADMIN" }));
    assert.deepEqual(adminUserPatchSchema.parse({ isActive: false }), { isActive: false });
  });

  it("rejects inverted audit time windows", () => {
    assert.throws(() =>
      auditLogQuerySchema.parse({
        from: "2026-09-02T00:00:00.000Z",
        until: "2026-09-01T00:00:00.000Z",
      }),
    );
  });
});

describe("report query schema", () => {
  it("rejects inverted windows without inventing filters", () => {
    const empty = reportQuerySchema.parse({});
    assert.equal(empty.from, undefined);
    assert.throws(() =>
      reportQuerySchema.parse({
        from: "2026-09-02T00:00:00.000Z",
        until: "2026-09-01T00:00:00.000Z",
      }),
    );
  });
});

describe("wallet address params", () => {
  it("accepts checksummed EVM addresses and rejects garbage", () => {
    const parsed = walletAddressParamSchema.parse({
      address: "0x1234567890abcdef1234567890abcdef12345678",
    });
    assert.equal(parsed.address, "0x1234567890abcdef1234567890abcdef12345678");
    assert.throws(() => walletAddressParamSchema.parse({ address: "not-an-address" }));
    assert.throws(() => walletAddressParamSchema.parse({ address: "0x1234" }));
  });
});
