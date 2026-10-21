import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const admin = "10000000-0000-4000-8000-000000000001",
  alice = "10000000-0000-4000-8000-000000000002",
  bob = "10000000-0000-4000-8000-000000000003";
test("PostgreSQL migration, submission transactions and RLS", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`,
    );
    let sql = await readFile(
      new URL(
        "../supabase/migrations/001_field_operations.sql",
        import.meta.url,
      ),
      "utf8",
    );
    sql = sql.replace("create extension if not exists pgcrypto;", "");
    await db.exec(sql);
    await db.exec(
      `insert into auth.users values('${admin}'),('${alice}'),('${bob}');insert into profiles(id,full_name,email,role) values('${admin}','Admin','admin@example.test','admin'),('${alice}','Alice','alice@example.test','supervisor'),('${bob}','Bob','bob@example.test','supervisor');`,
    );
    async function asUser<T>(id: string, fn: () => Promise<T>) {
      await db.exec(
        `set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`,
      );
      try {
        return await fn();
      } finally {
        await db.exec(
          `reset role;select set_config('request.jwt.claim.sub','',false);`,
        );
      }
    }
    async function location(
      user = alice,
      confirmed = true,
      age = "0 minutes",
      accuracy = 10,
    ) {
      const { rows } = await db.query<{ id: string }>(
        `insert into location_verifications(user_id,latitude,longitude,accuracy,captured_at,viewed_at,confirmed_at) values($1,24.7,46.6,$2,now()-$3::interval,now(),case when $4 then now() else null end) returning id`,
        [user, accuracy, age, confirmed],
      );
      return rows[0].id;
    }
    async function uploads(user = alice) {
      const { rows } = await db.query<{ id: string }>(
        `insert into photo_uploads(user_id,url) values($1,'https://i.ibb.co/test/one.jpg'),($1,'https://i.ibb.co/test/two.jpg') returning id`,
        [user],
      );
      return rows.map((r) => r.id);
    }
    async function payload() {
      return {
        kind: "waste",
        idempotency_key: crypto.randomUUID(),
        location_id: await location(),
        photo_ids: await uploads(),
        category: "Palm Waste",
        quantity: 3,
        unit: "Bags",
        description: "On-site record",
      };
    }
    async function submit(p: Record<string, unknown>, user = alice) {
      return asUser(user, () =>
        db.query<{ result: { id: string; number: string } }>(
          "select submit_report($1::jsonb) as result",
          [JSON.stringify(p)],
        ),
      );
    }
    let savedId = "";
    await t.test(
      "Atomic submission creates number, photos, in-app notification and pending email",
      async () => {
        const p = await payload();
        const { rows } = await submit(p);
        savedId = rows[0].result.id;
        assert.equal(rows[0].result.number, "COSA-0001");
        const count = await db.query<{ count: number }>(
          "select count(*)::int as count from waste_report_photos where report_id=$1",
          [savedId],
        );
        assert.equal(count.rows[0].count, 2);
        const n = await db.query(
          "select * from notifications where record_id=$1",
          [savedId],
        );
        assert.equal(n.rows.length, 1);
        const d = await db.query<{ status: string }>(
          "select status from delivery_attempts where record_id=$1",
          [savedId],
        );
        assert.equal(d.rows[0].status, "pending");
        const repeated = await submit(p);
        assert.equal(repeated.rows[0].result.id, savedId);
      },
    );
    await t.test("Sequential identifiers remain unique", async () => {
      const one = await submit(await payload());
      const two = await submit(await payload());
      assert.notEqual(one.rows[0].result.number, two.rows[0].result.number);
    });
    await t.test(
      "GPS capture alone, stale readings and poor accuracy cannot create reports",
      async () => {
        for (const loc of [
          await location(alice, false),
          await location(alice, true, "6 minutes"),
          await location(alice, true, "0 minutes", 30),
        ]) {
          const p = { ...(await payload()), location_id: loc };
          await assert.rejects(submit(p), /Capture and confirm/);
        }
      },
    );
    await t.test(
      "Location and uploads must belong to the authenticated supervisor",
      async () => {
        await assert.rejects(
          submit({ ...(await payload()), location_id: await location(bob) }),
          /Capture and confirm/,
        );
        await assert.rejects(
          submit({ ...(await payload()), photo_ids: await uploads(bob) }),
          /Invalid or already used/,
        );
      },
    );
    await t.test(
      "Distinct photographs and a map view event are mandatory",
      async () => {
        const p = await payload();
        await assert.rejects(
          submit({ ...p, photo_ids: [p.photo_ids[0], p.photo_ids[0]] }),
          /distinct photographs/,
        );
        await db.query(
          "update location_verifications set viewed_at=null where id=$1",
          [p.location_id],
        );
        await assert.rejects(submit(p), /Capture and confirm/);
      },
    );
    await t.test(
      "RLS prevents other supervisors from reading records or photographs",
      async () => {
        await asUser(bob, async () => {
          assert.equal(
            (await db.query("select * from waste_reports")).rows.length,
            0,
          );
          assert.equal(
            (await db.query("select * from waste_report_photos")).rows.length,
            0,
          );
          assert.equal(
            (await db.query("select * from profiles")).rows.length,
            1,
          );
        });
        await asUser(alice, async () =>
          assert.ok(
            (await db.query("select * from waste_reports")).rows.length > 0,
          ),
        );
      },
    );
    await t.test(
      "Supervisor cannot edit/delete submissions or spoof ownership and GPS metadata",
      async () => {
        await asUser(alice, async () => {
          const update = await db.query(
            "update waste_reports set quantity=99 where id=$1 returning id",
            [savedId],
          );
          assert.equal(update.rows.length, 0);
          const del = await db.query(
            "delete from waste_reports where id=$1 returning id",
            [savedId],
          );
          assert.equal(del.rows.length, 0);
          await assert.rejects(
            db.query("update waste_reports set supervisor_id=$1 where id=$2", [
              bob,
              savedId,
            ]),
            /permission denied/,
          );
          await assert.rejects(
            db.query("update waste_reports set latitude=0 where id=$1", [
              savedId,
            ]),
            /permission denied/,
          );
          await assert.rejects(
            db.query("insert into photo_uploads(user_id,url) values($1,$2)", [
              alice,
              "https://i.ibb.co/fake/a.jpg",
            ]),
            /permission denied/,
          );
          await assert.rejects(
            db.query("select claim_delivery($1,'waste','fake@example.test')", [
              savedId,
            ]),
            /permission denied/,
          );
        });
      },
    );
    await t.test(
      "Facility access is limited to assignments; inspections preserve history",
      async () => {
        const result = await asUser(admin, () =>
          db.query<{ id: string }>(
            "select register_facility($1::jsonb) as id",
            [
              JSON.stringify({
                name: "Site cabin",
                category: "Office / Site Cabin",
                site: "Test project",
                description: "",
                status: "Operational",
                latitude: 24.7,
                longitude: 46.6,
                assigned_supervisor: alice,
                remarks: "",
                photo_ids: [],
              }),
            ],
          ),
        );
        const facility = result.rows[0].id;
        await asUser(bob, async () =>
          assert.equal(
            (await db.query("select * from facilities")).rows.length,
            0,
          ),
        );
        await asUser(alice, async () =>
          assert.equal(
            (await db.query("select * from facilities")).rows.length,
            1,
          ),
        );
        const p = {
          ...(await payload()),
          kind: "inspection",
          facility_id: facility,
          condition: "Operational",
          inspection_date: new Date().toISOString().slice(0, 10),
        };
        await assert.rejects(
          submit(
            {
              ...p,
              location_id: await location(bob),
              photo_ids: await uploads(bob),
            },
            bob,
          ),
          /Facility not authorized/,
        );
        const inspection = await submit(p);
        assert.equal(inspection.rows[0].result.number, "OFT-I-000001");
        await asUser(admin, () =>
          db.query("update facilities set archived_at=now() where id=$1", [
            facility,
          ]),
        );
        await asUser(alice, async () => {
          assert.equal(
            (await db.query("select * from facilities")).rows.length,
            0,
          );
          assert.equal(
            (await db.query("select * from facility_inspections")).rows.length,
            1,
          );
        });
      },
    );
    await t.test(
      "Inactive accounts are blocked by both RLS and the submission function",
      async () => {
        await db.query("update profiles set is_active=false where id=$1", [
          alice,
        ]);
        await asUser(alice, async () =>
          assert.equal(
            (await db.query("select * from waste_reports")).rows.length,
            0,
          ),
        );
        await assert.rejects(submit(await payload()), /Unauthorized/);
        await db.query("update profiles set is_active=true where id=$1", [
          alice,
        ]);
      },
    );
    await t.test(
      "Administrator edits are audited; immutable GPS columns remain protected",
      async () => {
        await asUser(admin, async () => {
          const { rows } = await db.query(
            "update waste_reports set quantity=5 where id=$1 returning id",
            [savedId],
          );
          assert.equal(rows.length, 1);
          await assert.rejects(
            db.query(
              "update waste_reports set location_confirmed_at=now() where id=$1",
              [savedId],
            ),
            /permission denied/,
          );
          assert.ok(
            (
              await db.query(
                "select * from audit_logs where record_id=$1 and action='UPDATE'",
                [savedId],
              )
            ).rows.length,
          );
        });
      },
    );
    await t.test(
      "Recapturing invalidates previously confirmed GPS verification",
      async () => {
        const old = await location();
        await db.query("select capture_location($1,$2::jsonb)", [
          alice,
          JSON.stringify({
            latitude: 24.7,
            longitude: 46.6,
            accuracy: 10,
            captured_at: new Date().toISOString(),
          }),
        ]);
        const p = { ...(await payload()), location_id: old };
        await assert.rejects(submit(p), /Capture and confirm/);
        await asUser(alice, async () => {
          await assert.rejects(
            db.query("select capture_location($1,$2::jsonb)", [bob, "{}"]),
            /permission denied/,
          );
          await assert.rejects(
            db.query("update profiles set role='admin' where id=$1", [alice]),
            /permission denied/,
          );
        });
      },
    );
  } finally {
    await db.close();
  }
});
