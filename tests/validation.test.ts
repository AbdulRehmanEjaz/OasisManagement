import test from "node:test";
import assert from "node:assert/strict";
import {
  reportSchema,
  validateGPS,
  canManage,
  facilitySchema,
} from "../src/lib/validation";
const now = Date.now();
const gps = {
  latitude: 24.71361234,
  longitude: 46.67534567,
  accuracy: 15,
  captured_at: new Date(now).toISOString(),
};
const uuid = "a0000000-0000-4000-8000-000000000001",
  uuid2 = "a0000000-0000-4000-8000-000000000002";
const waste = {
  site: "North site",
  kind: "waste",
  idempotency_key: uuid,
  location_id: uuid,
  photo_ids: [uuid, uuid2],
  category: "Palm Waste",
  quantity: 12.5,
  unit: "Bags",
  description: "",
};
test("GPS preserves precision and accepts recent accurate fixes", () =>
  assert.deepEqual(validateGPS(gps, 20, now), gps));
test("GPS rejects inaccurate, stale, future and invalid coordinates", () => {
  for (const change of [
    { accuracy: 21 },
    { captured_at: new Date(now - 300001).toISOString() },
    { captured_at: new Date(now + 10001).toISOString() },
    { latitude: 91 },
    { longitude: -181 },
    { accuracy: 0 },
  ])
    assert.throws(() => validateGPS({ ...gps, ...change }, 20, now));
});
test("GPS threshold is configurable", () => {
  assert.doesNotThrow(() => validateGPS({ ...gps, accuracy: 25 }, 30, now));
  assert.throws(() => validateGPS({ ...gps, accuracy: 25 }, 20, now));
});
test("Waste validates quantity and 2–3 distinct photos", () => {
  assert.ok(reportSchema.safeParse(waste).success);
  for (const change of [
    { quantity: 0 },
    { quantity: -2 },
    { photo_ids: [uuid] },
    { photo_ids: [uuid, uuid] },
    { location_id: undefined },
    { category: undefined },
  ])
    assert.equal(
      reportSchema.safeParse({ ...waste, ...change }).success,
      false,
    );
});
test("Other waste requires remarks", () =>
  assert.equal(
    reportSchema.safeParse({ ...waste, category: "Other" }).success,
    false,
  ));
test("Inspections require authorized reference metadata and observations", () => {
  const data = {
    ...waste,
    kind: "inspection",
    facility_id: uuid,
    condition: "Operational",
    description: "Inspected on site",
    structure_type: "Metal Structures",
  };
  assert.ok(reportSchema.safeParse(data).success);
  for (const key of [
    "facility_id",
    "condition",
    "description",
    "site",
    "structure_type",
  ])
    assert.equal(
      reportSchema.safeParse({ ...data, [key]: undefined }).success,
      false,
    );
});
test("Only administrator roles have management capability", () => {
  assert.equal(canManage("admin"), true);
  for (const role of ["supervisor", "", "administrator"])
    assert.equal(canManage(role), false);
});
test("Facility registration rejects invalid coordinates and missing site", () => {
  const facility = {
    name: "Cabin",
    category: "Office / Site Cabin",
    site: "North site",
    status: "Operational",
    latitude: 24,
    longitude: 46,
  };
  assert.ok(facilitySchema.safeParse(facility).success);
  assert.equal(
    facilitySchema.safeParse({ ...facility, latitude: 100 }).success,
    false,
  );
  assert.equal(
    facilitySchema.safeParse({ ...facility, site: "" }).success,
    false,
  );
});
