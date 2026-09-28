import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toAdminUserParams, toAuditLogParams, toReportParams } from "../admin";

describe("toAdminUserParams", () => {
  it("omits empty filters", () => {
    assert.equal(toAdminUserParams({}), "");
    assert.equal(toAdminUserParams({ q: "" }), "");
  });

  it("encodes role, status and search", () => {
    const encoded = toAdminUserParams({ role: "SELLER", isActive: false, q: "mesh", page: 2, pageSize: 20 });
    const params = new URLSearchParams(encoded.slice(1));
    assert.equal(params.get("role"), "SELLER");
    assert.equal(params.get("isActive"), "false");
    assert.equal(params.get("q"), "mesh");
    assert.equal(params.get("page"), "2");
  });
});

describe("toAuditLogParams", () => {
  it("encodes action and entity type", () => {
    const encoded = toAuditLogParams({ action: "ADMIN_ACTION", entityType: "User", pageSize: 50 });
    const params = new URLSearchParams(encoded.slice(1));
    assert.equal(params.get("action"), "ADMIN_ACTION");
    assert.equal(params.get("entityType"), "User");
    assert.equal(params.get("pageSize"), "50");
  });
});

describe("toReportParams", () => {
  it("omits empty zone and encodes energy type", () => {
    assert.equal(toReportParams({ marketZone: "" }), "");
    const encoded = toReportParams({ energyType: "SOLAR", marketZone: "ERCOT-WEST" });
    const params = new URLSearchParams(encoded.slice(1));
    assert.equal(params.get("energyType"), "SOLAR");
    assert.equal(params.get("marketZone"), "ERCOT-WEST");
  });
});
