import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PinStore, hashPin, checkPin } from "../src/lib/pin-store";
import { isSameOrigin } from "../src/lib/request-security";
import { canReadType, canSubmit, allowedViews } from "../src/lib/access-policy";
test("PIN hashing keeps leading zeroes and uses independent salts", () => {
  const one = hashPin("001234"),
    two = hashPin("001234");
  assert.notEqual(one, two);
  assert.ok(checkPin("001234", one));
  assert.equal(checkPin("1234", one), false);
  assert.equal(checkPin("incorrect", one), false);
});
test("Write-origin checks accept normalized localhost requests and reject cross-site origins", () => {
  const headers = new Headers({
    host: "127.0.0.1:3000",
    origin: "http://127.0.0.1:3000",
  });
  assert.ok(isSameOrigin({ headers, url: "http://localhost:3000/api/auth" }));
  headers.set("origin", "https://attacker.test");
  assert.equal(
    isSameOrigin({ headers, url: "http://localhost:3000/api/auth" }),
    false,
  );
  headers.delete("origin");
  assert.equal(
    isSameOrigin({ headers, url: "http://localhost:3000/api/auth" }),
    false,
  );
});
test("Panel permissions restrict Viewer and Supervisor operations", () => {
  assert.ok(canReadType("viewer", "waste"));
  assert.ok(canReadType("viewer", "facilities"));
  assert.equal(canReadType("viewer", "users"), false);
  assert.equal(canReadType("viewer", "deliveries"), false);
  assert.equal(canSubmit("viewer"), false);
  assert.ok(canSubmit("supervisor"));
  assert.equal(canReadType("supervisor", "waste"), false);
  assert.equal(canReadType("supervisor", "overview"), false);
  assert.deepEqual(allowedViews("supervisor"), ["dashboard"]);
  assert.equal(allowedViews("viewer").includes("users"), false);
});
test("PIN sessions persist, expire, revoke and enforce login throttling", () => {
  const dir = mkdtempSync(join(tmpdir(), "oasis-auth-"));
  let store = new PinStore(join(dir, "access.sqlite"));
  try {
    store.seed({ admin: "001234", viewer: "005678", supervisor: "009876" });
    const now = Date.now();
    for (const [pin, role] of [
      ["001234", "admin"],
      ["005678", "viewer"],
      ["009876", "supervisor"],
    ]) {
      const automatic = store.login(pin, now);
      assert.equal(store.session(automatic, now)?.role, role);
      store.logout(automatic);
    }
    const token = store.login("001234", now);
    assert.equal(store.session(token, now)?.role, "admin");
    assert.equal(store.session(token, now + 28800001), null);
    assert.equal(store.session(token + "0", now), null);
    store.close();
    store = new PinStore(join(dir, "access.sqlite"));
    assert.equal(store.session(token, now)?.role, "admin");
    const admin = store.list().find((a) => a.role === "admin")!;
    const viewer = store.list().find((a) => a.role === "viewer")!;
    const viewerToken = store.login("005678", now);
    store.change(viewer.id, admin.id, { pin: "007777" });
    assert.equal(store.session(viewerToken, now), null);
    assert.throws(() => store.login("005678", now), /Incorrect/);
    const replacement = store.login("007777", now);
    store.change(viewer.id, admin.id, { is_active: false });
    assert.equal(store.session(replacement, now), null);
    assert.throws(() => store.login("007777", now), /Incorrect/);
    store.change(viewer.id, admin.id, { is_active: true });
    assert.ok(store.login("007777", now));
    const added = store.create("Field user", "supervisor", "003333");
    const submitToken = store.login("003333", now);
    store.change(added, admin.id, { remove: true });
    assert.equal(store.session(submitToken, now), null);
    assert.equal(
      store.list().some((a) => a.id === added),
      false,
    );
    assert.throws(
      () => store.change(admin.id, admin.id, { remove: true }),
      /own account/,
    );
    store.logout(token);
    assert.equal(store.session(token, now), null);
    for (let n = 0; n < 5; n++) {
      if (n === 4) assert.ok(store.login("001234", now));
      assert.throws(() => store.login("000000", now), /Incorrect/);
    }
    assert.throws(() => store.login("009876", now), /Too many/);
    assert.ok(store.login("009876", now + 300001));
    assert.equal(JSON.stringify(store.list()).includes("pin_hash"), false);
  } finally {
    store.close();
    assert.ok(dir.startsWith(join(tmpdir(), "oasis-auth-")));
    rmSync(dir, { recursive: true, force: true });
  }
});
