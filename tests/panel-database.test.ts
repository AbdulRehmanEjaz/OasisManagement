import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const admin = "20000000-0000-4000-8000-000000000001",
  viewer = "20000000-0000-4000-8000-000000000002",
  supervisor = "20000000-0000-4000-8000-000000000003";
test("Three-panel PostgreSQL access policies and privacy", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('session_id',current_setting('request.jwt.claim.session_id',true)) $$;grant usage on schema auth to authenticated;grant execute on function auth.uid(),auth.jwt() to authenticated;`,
    );
    for (const name of [
      "001_field_operations.sql",
      "002_panels_and_pins.sql",
      "003_pin_only_login.sql",
    ]) {
      const sql = (
        await readFile(
          new URL("../supabase/migrations/" + name, import.meta.url),
          "utf8",
        )
      ).replace("create extension if not exists pgcrypto;", "");
      await db.exec(sql);
    }
    for (const [id, role] of [
      [admin, "admin"],
      [viewer, "viewer"],
      [supervisor, "supervisor"],
    ]) {
      await db.query("insert into auth.users values($1)", [id]);
      await db.query(
        "insert into profiles(id,full_name,email,role) values($1,$2,$3,$4)",
        [
          id,
          role === "supervisor" ? "PRIVATE SUPERVISOR NAME" : role,
          role + "@private.test",
          role,
        ],
      );
      await db.query(
        "insert into pin_credentials(user_id,pin_hash,fingerprint) values($1,$2,$3)",
        [id, "salt:hash", role],
      );
      await db.query(
        "insert into pin_sessions(session_id,user_id,credential_version) values($1,$1,1)",
        [id],
      );
    }
    const { rows: facilities } = await db.query<{ id: string }>(
      `insert into facilities(name,category,site,status,latitude,longitude,assigned_supervisor) values('Cabin','Office / Site Cabin','North site','Operational',24.7,46.6,$1) returning id`,
      [supervisor],
    );
    const { rows: reports } = await db.query<{ id: string }>(
      `insert into waste_reports(supervisor_id,site,category,quantity,unit,latitude,longitude,gps_accuracy_meters,gps_captured_at,location_confirmed,location_confirmed_at,idempotency_key) values($1,'North site','Palm Waste',4,'Bags',24.7,46.6,10,now(),true,now(),gen_random_uuid()) returning id`,
      [supervisor],
    );
    await db.query(
      "insert into waste_report_photos(report_id,url) values($1,'https://i.ibb.co/site.jpg')",
      [reports[0].id],
    );
    async function asUser<T>(id: string, fn: () => Promise<T>) {
      await db.exec(
        `set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);select set_config('request.jwt.claim.session_id','${id}',false);`,
      );
      try {
        return await fn();
      } finally {
        await db.exec(
          `reset role;select set_config('request.jwt.claim.sub','',false);select set_config('request.jwt.claim.session_id','',false);`,
        );
      }
    }
    await t.test(
      "Viewer sees reports and map coordinates with no user identity fields",
      async () => {
        await asUser(viewer, async () => {
          const { rows } = await db.query<{
            data: { data: Record<string, unknown>[]; count: number };
          }>("select viewer_records('waste','{}') as data");
          assert.equal(rows[0].data.count, 1);
          assert.equal(rows[0].data.data[0].latitude, 24.7);
          const serialized = JSON.stringify(rows[0].data);
          for (const secret of [
            "supervisor_id",
            "PRIVATE SUPERVISOR NAME",
            "private.test",
            supervisor,
          ])
            assert.equal(serialized.includes(secret), false);
          assert.equal(
            (await db.query("select * from waste_reports")).rows.length,
            0,
          );
          assert.equal(
            (await db.query("select * from waste_report_photos")).rows.length,
            0,
          );
          const profiles = await db.query<{ id: string }>(
            "select id from profiles",
          );
          assert.deepEqual(
            profiles.rows.map((r) => r.id),
            [viewer],
          );
        });
      },
    );
    await t.test(
      "Viewer cannot submit, edit, delete or access PIN tables",
      async () => {
        await asUser(viewer, async () => {
          await assert.rejects(
            db.query("select submit_report('{}')"),
            /Unauthorized/,
          );
          assert.equal(
            (
              await db.query(
                "update waste_reports set quantity=99 returning id",
              )
            ).rows.length,
            0,
          );
          assert.equal(
            (await db.query("delete from waste_reports returning id")).rows
              .length,
            0,
          );
          await assert.rejects(
            db.query("select * from pin_credentials"),
            /permission denied/,
          );
          await assert.rejects(
            db.query("select * from pin_sessions"),
            /permission denied/,
          );
          await assert.rejects(
            db.query("select facility_choices()"),
            /Submission access/,
          );
        });
      },
    );
    await t.test(
      "Supervisor is submit-only, with minimal facility choices",
      async () => {
        await asUser(supervisor, async () => {
          assert.equal(
            (await db.query("select * from waste_reports")).rows.length,
            0,
          );
          assert.equal(
            (await db.query("select * from facility_inspections")).rows.length,
            0,
          );
          assert.equal(
            (await db.query("select * from facilities")).rows.length,
            0,
          );
          const result = await db.query<{ data: Record<string, unknown>[][] }>(
            "select facility_choices() as data",
          );
          assert.equal(
            (result.rows[0].data as unknown as any[])[0].id,
            facilities[0].id,
          );
          await assert.rejects(
            db.query("select viewer_records('waste','{}')"),
            /Viewer access/,
          );
        });
        const { rows: loc } = await db.query<{ id: string }>(
          "insert into location_verifications(user_id,latitude,longitude,accuracy,captured_at,viewed_at,confirmed_at) values($1,24.7,46.6,10,now(),now(),now()) returning id",
          [supervisor],
        );
        const { rows: photos } = await db.query<{ id: string }>(
          "insert into photo_uploads(user_id,url) values($1,'https://i.ibb.co/one.jpg'),($1,'https://i.ibb.co/two.jpg') returning id",
          [supervisor],
        );
        await asUser(supervisor, async () => {
          const { rows } = await db.query<{ data: { number: string } }>(
            "select submit_report($1::jsonb) as data",
            [
              JSON.stringify({
                kind: "waste",
                site: "North site",
                category: "Palm Waste",
                quantity: 2,
                unit: "Bags",
                description: "Site observation",
                location_id: loc[0].id,
                photo_ids: photos.map((p) => p.id),
                idempotency_key: crypto.randomUUID(),
              }),
            ],
          );
          assert.match(rows[0].data.number, /COSA-/);
          assert.equal(
            (await db.query("select * from waste_reports")).rows.length,
            0,
          );
        });
      },
    );
    await t.test(
      "PIN version changes revoke old sessions at the RLS level",
      async () => {
        await db.query(
          "update pin_credentials set version=2 where user_id=$1",
          [viewer],
        );
        await asUser(viewer, async () => {
          const { rows } = await db.query<{ active: boolean }>(
            "select active_user() as active",
          );
          assert.equal(rows[0].active, false);
          await assert.rejects(
            db.query("select viewer_records('waste','{}')"),
            /Viewer access/,
          );
        });
      },
    );
    await t.test(
      "Administrator retains record and user management",
      async () => {
        await asUser(admin, async () => {
          assert.equal(
            (await db.query("select * from profiles")).rows.length,
            3,
          );
          assert.equal(
            (await db.query("select * from waste_reports")).rows.length,
            2,
          );
          assert.equal(
            (
              await db.query(
                "update waste_reports set quantity=7 where id=$1 returning id",
                [reports[0].id],
              )
            ).rows.length,
            1,
          );
        });
      },
    );
    await t.test(
      "PIN-only login limits are shared and successful login preserves previous failures",
      async () => {
        for (let n = 0; n < 4; n++)
          assert.equal(
            (
              await db.query<{ allowed: boolean }>(
                "select pin_login_gate('login') as allowed",
              )
            ).rows[0].allowed,
            true,
          );
        assert.equal(
          (
            await db.query<{ allowed: boolean }>(
              "select pin_login_gate('login') as allowed",
            )
          ).rows[0].allowed,
          true,
        );
        await db.query("select pin_login_succeeded()");
        assert.equal(
          (
            await db.query<{ hits: number }>(
              "select hits from pin_login_limits where role='login'",
            )
          ).rows[0].hits,
          4,
        );
        assert.equal(
          (
            await db.query<{ allowed: boolean }>(
              "select pin_login_gate('login') as allowed",
            )
          ).rows[0].allowed,
          true,
        );
        assert.equal(
          (
            await db.query<{ allowed: boolean }>(
              "select pin_login_gate('login') as allowed",
            )
          ).rows[0].allowed,
          false,
        );
        assert.equal(
          (
            await db.query<{ allowed: boolean }>(
              "select pin_login_gate('admin') as allowed",
            )
          ).rows[0].allowed,
          false,
        );
        await asUser(admin, async () => {
          await assert.rejects(
            db.query("select pin_login_succeeded()"),
            /permission denied/,
          );
        });
      },
    );
  } finally {
    await db.close();
  }
});
