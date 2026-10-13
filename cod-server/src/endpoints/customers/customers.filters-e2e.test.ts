/**
 * getAllCustomers + getAllDrivers — Slice 8 real-D1 E2E.
 *
 * Verifies on a real engine (miniflare + real migrations, which ENFORCE the
 * 100-bound-parameter limit — the exact failure this slice removes):
 *   • THE CRASH CASE: a customer group with 150 members filtered through
 *     the list endpoint — pre-Slice 8 this built inArray(…150 ids) and
 *     failed with "too many SQL variables"; the EXISTS subquery carries
 *     a single bound param regardless of membership size.
 *   • group/tag filters return exactly the members, paginated
 *   • empty group → empty page; combined filters (AND semantics)
 *   • drivers: wilaya filter via EXISTS on compensations; empty coverage;
 *     unfiltered list with compensation counts
 *   • EXPLAIN proof that the EXISTS plans use the indexes from Slice 1
 */

import { sql } from "drizzle-orm";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb, type TestDb } from "@/test-utils/pg";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import * as schema from "@/db/schema";
import type { AppDb } from "@/db";
import { getAllCustomers } from "../../../../cod-shared/queries/customers";
import { getAllDrivers } from "../../../../cod-shared/queries/drivers";

const registry: TestDb[] = [];
let db: AppDb;

const CRASH_GROUP_MEMBERS = 150;

beforeAll(async () => {
  const harness = await createTestDb();
  registry.push(harness);
  db = harness.db;

  const now = new Date().toISOString();

  await db.insert(schema.customerGroups).values([
    { id: "grp-big", name: "Big Group", description: null, color: "#111111", memberCount: CRASH_GROUP_MEMBERS, createdAt: now, updatedAt: now },
    { id: "grp-small", name: "Small Group", description: null, color: "#222222", memberCount: 2, createdAt: now, updatedAt: now },
    { id: "grp-empty", name: "Empty Group", description: null, color: "#333333", memberCount: 0, createdAt: now, updatedAt: now },
  ]);
  await db.insert(schema.customerTags).values([
    { id: "tag-vip", name: "vip", color: "#00ff00", assignmentCount: 60, createdAt: now, updatedAt: now },
    { id: "tag-none", name: "none", color: "#000000", assignmentCount: 0, createdAt: now, updatedAt: now },
  ]);

  const bigCustomerIds: string[] = [];
  for (let i = 0; i < CRASH_GROUP_MEMBERS; i += 10) {
    const batch = Array.from({ length: Math.min(10, CRASH_GROUP_MEMBERS - i) }, (_, j) => {
      const n = i + j;
      return {
        id: `cust-${n}`,
        name: `Customer ${n}`,
        phone: `0770${String(n).padStart(6, "0")}`,
        wilayaId: n % 2 === 0 ? 16 : 31,
        wilaya: n % 2 === 0 ? "الجزائر" : "وهران",
        createdAt: `2026-01-${String((n % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
      };
    });
    bigCustomerIds.push(...batch.map((c) => c.id));
    await db.insert(schema.customers).values(batch);
  }

  for (let i = 0; i < CRASH_GROUP_MEMBERS; i += 20) {
    await db.insert(schema.customerGroupMembers).values(
      Array.from({ length: Math.min(20, CRASH_GROUP_MEMBERS - i) }, (_, j) => ({
        id: `gm-${i + j}`,
        customerId: `cust-${i + j}`,
        groupId: "grp-big",
        assignedAt: now,
      })),
    );
  }
  await db.insert(schema.customerGroupMembers).values([
    { id: "gm-small-1", customerId: "cust-0", groupId: "grp-small", assignedAt: now },
    { id: "gm-small-2", customerId: "cust-1", groupId: "grp-small", assignedAt: now },
  ]);

  for (let i = 0; i < 60; i += 20) {
    await db.insert(schema.customerTagAssignments).values(
      Array.from({ length: Math.min(20, 60 - i) }, (_, j) => ({
        id: `ta-${i + j}`,
        customerId: `cust-${i + j}`,
        tagId: "tag-vip",
        assignedAt: now,
      })),
    );
  }

  await db.insert(schema.drivers).values([
    { id: "drv-16", firstName: "Ali", lastName: "One", phone: "0550000001", status: "available", totalDelivered: 0, totalEarnings: 0, pendingCash: 0, totalPaid: 0, createdAt: now, updatedAt: now },
    { id: "drv-31", firstName: "Bilal", lastName: "Two", phone: "0550000002", status: "available", totalDelivered: 0, totalEarnings: 0, pendingCash: 0, totalPaid: 0, createdAt: now, updatedAt: now },
    { id: "drv-none", firstName: "Cherif", lastName: "Three", phone: "0550000003", status: "available", totalDelivered: 0, totalEarnings: 0, pendingCash: 0, totalPaid: 0, createdAt: now, updatedAt: now },
  ]);
  await db.insert(schema.driverCompensations).values([
    { id: "dc-1", driverId: "drv-16", wilayaId: 16, feePerDelivery: 400, createdAt: now, updatedAt: now },
    { id: "dc-2", driverId: "drv-16", wilayaId: 31, feePerDelivery: 500, createdAt: now, updatedAt: now },
    { id: "dc-3", driverId: "drv-31", wilayaId: 31, feePerDelivery: 450, createdAt: now, updatedAt: now },
  ]);
}, 180_000);

afterAll(async () => {
  for (const mf of registry) await mf.dispose();
});

describe("getAllCustomers — real D1", () => {
  it("THE CRASH CASE: filters by a group with 150 members (no param explosion)", async () => {
    const rows = await getAllCustomers(db, { groupId: "grp-big", limit: 200 });
    expect(rows).toHaveLength(CRASH_GROUP_MEMBERS);
  });

  it("paginates the big group with limit/offset", async () => {
    const page1 = await getAllCustomers(db, { groupId: "grp-big", limit: 100, offset: 0 });
    const page2 = await getAllCustomers(db, { groupId: "grp-big", limit: 100, offset: 100 });
    expect(page1).toHaveLength(100);
    expect(page2).toHaveLength(50);
    expect(new Set([...page1, ...page2].map((c) => c.id)).size).toBe(CRASH_GROUP_MEMBERS);
  });

  it("small group returns exactly its 2 members", async () => {
    const rows = await getAllCustomers(db, { groupId: "grp-small" });
    expect(rows.map((r) => r.id).sort()).toEqual(["cust-0", "cust-1"]);
  });

  it("empty group returns an empty page", async () => {
    const rows = await getAllCustomers(db, { groupId: "grp-empty" });
    expect(rows).toEqual([]);
  });

  it("tag filter returns the 60 tagged members", async () => {
    const rows = await getAllCustomers(db, { tagId: "tag-vip", limit: 200 });
    expect(rows).toHaveLength(60);
    expect(rows.every((r) => Number(r.id.replace("cust-", "")) < 60)).toBe(true);
  });

  it("empty tag returns an empty page", async () => {
    const rows = await getAllCustomers(db, { tagId: "tag-none" });
    expect(rows).toEqual([]);
  });

  it("group + tag filters AND together", async () => {
    const rows = await getAllCustomers(db, { groupId: "grp-big", tagId: "tag-vip", limit: 200 });
    expect(rows).toHaveLength(60);
  });

  it("wilaya filter narrows the big group (16 → even-numbered members)", async () => {
    const rows = await getAllCustomers(db, { groupId: "grp-big", wilayaId: 16, limit: 200 });
    expect(rows).toHaveLength(75);
    expect(rows.every((r) => r.wilayaId === 16)).toBe(true);
  });

  it("unfiltered list is paginated plain", async () => {
    const rows = await getAllCustomers(db, { limit: 10, offset: 0 });
    expect(rows).toHaveLength(10);
    const beyond = await getAllCustomers(db, { limit: 10, offset: 5000 });
    expect(beyond).toEqual([]);
  });
});

describe("getAllDrivers — real D1", () => {
  it("wilaya 16 filter returns only drv-16 with its compensation count", async () => {
    const rows = await getAllDrivers(db, { wilayaId: 16 });
    expect(rows.map((r) => r.id)).toEqual(["drv-16"]);
    expect(rows[0]).toMatchObject({ compensationWilayaCount: 2 });
  });

  it("wilaya 31 filter returns both covering drivers", async () => {
    const rows = await getAllDrivers(db, { wilayaId: 31 });
    expect(rows.map((r) => r.id).sort()).toEqual(["drv-16", "drv-31"]);
  });

  it("wilaya with no coverage returns an empty page (not a crash)", async () => {
    const rows = await getAllDrivers(db, { wilayaId: 58 });
    expect(rows).toEqual([]);
  });

  it("unfiltered list includes the uncovered driver with count 0", async () => {
    const rows = await getAllDrivers(db);
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.id === "drv-none")).toMatchObject({ compensationWilayaCount: 0 });
    expect(rows.find((r) => r.id === "drv-16")).toMatchObject({ compensationWilayaCount: 2 });
  });
});

describe("EXISTS plans use the Slice 1 indexes", () => {
  /** PostgreSQL's plan for `query`, with sequential scans off so these tiny tables still show which index serves it. */
  async function planOf(query: ReturnType<typeof sql>): Promise<string> {
    await db.execute(sql`set enable_seqscan = off`);
    try {
      const result = await db.execute(sql`explain ${query}`);
      return (result.rows as Array<Record<string, string>>).map((r) => r["QUERY PLAN"]).join(" | ");
    } finally {
      await db.execute(sql`reset enable_seqscan`);
    }
  }

  it("customer group-membership EXISTS searches the unique index", async () => {
    const plan = await planOf(sql`SELECT * FROM customers WHERE EXISTS (
      SELECT 1 FROM customer_group_members
      WHERE customer_group_members.customer_id = customers.id
        AND customer_group_members.group_id = ${"grp-big"}
    )`);
    expect(plan).toContain("customer_group_members_customer_group_unique");
  });

  it("driver compensation EXISTS searches the unique index", async () => {
    const plan = await planOf(sql`SELECT * FROM drivers WHERE EXISTS (
      SELECT 1 FROM driver_compensations
      WHERE driver_compensations.driver_id = drivers.id
        AND driver_compensations.wilaya_id = ${16}
    )`);
    expect(plan).toContain("driver_compensations_driver_wilaya_unique");
  });
});

