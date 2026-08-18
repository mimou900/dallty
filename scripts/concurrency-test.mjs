// Project 09 Phase 8: real concurrency test.
//
// Fires 12 genuinely concurrent INSERT attempts (separate HTTP requests -> separate Postgres
// connections, not statements inside one transaction) at the exact same staff_id + time window,
// to prove the bookings_no_overlap EXCLUDE constraint is what actually prevents double-booking
// under real concurrency, not just app-level "check then insert" logic that a race can beat.
// Expects exactly 1 success and 11 failures with Postgres exclusion-violation code 23P01.
//
// Reads SUPABASE_PROJECT_ID / SUPABASE_ACCESS_TOKEN from the environment. Cleans up every row
// it creates (including the one successful booking) before exiting.

const PROJECT_ID = process.env.SUPABASE_PROJECT_ID;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const API = `https://api.supabase.com/v1/projects/${PROJECT_ID}/database/query`;
const CONCURRENCY = 12;

async function runSql(query) {
  const res = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const json = await res.json();
  if (Array.isArray(json)) return json;
  return { error: json };
}

function esc(s) {
  return String(s).replace(/'/g, "''");
}

async function main() {
  console.log("Setting up fixtures...");
  const setup = await runSql(`
    DO $$
    DECLARE
      v_business uuid; v_branch uuid; v_staff uuid; v_service uuid;
    BEGIN
      SELECT id INTO v_business FROM businesses LIMIT 1;
      SELECT id INTO v_branch FROM business_branches WHERE business_id = v_business AND is_main LIMIT 1;
      SELECT id INTO v_staff FROM staff WHERE business_id = v_business LIMIT 1;
      IF v_staff IS NULL THEN
        INSERT INTO staff (business_id, full_name, is_active) VALUES (v_business, 'Concurrency Test Staff', true) RETURNING id INTO v_staff;
      END IF;
      SELECT id INTO v_service FROM services WHERE business_id = v_business LIMIT 1;
      IF v_service IS NULL THEN
        INSERT INTO services (business_id, name, duration_minutes, price, is_active) VALUES (v_business, 'Concurrency Test Service', 30, 100, true) RETURNING id INTO v_service;
      END IF;
      INSERT INTO staff_branches (staff_id, branch_id, is_primary) VALUES (v_staff, v_branch, true) ON CONFLICT (staff_id, branch_id) DO NOTHING;
      CREATE TABLE IF NOT EXISTS _concurrency_test_ids (business_id uuid, branch_id uuid, staff_id uuid, service_id uuid);
      DELETE FROM _concurrency_test_ids;
      INSERT INTO _concurrency_test_ids VALUES (v_business, v_branch, v_staff, v_service);
    END $$;
    SELECT business_id, branch_id, staff_id, service_id FROM _concurrency_test_ids;
  `);
  if (setup.error) throw new Error("Setup failed: " + JSON.stringify(setup.error));
  const { business_id, branch_id, staff_id, service_id } = setup[0];
  console.log("Fixtures:", { business_id, branch_id, staff_id, service_id });

  const startsAt = new Date(Date.now() + 10 * 86400_000); // 10 days out, arbitrary but fixed
  startsAt.setUTCHours(9, 0, 0, 0);
  const endsAt = new Date(startsAt.getTime() + 30 * 60_000);

  console.log(`Firing ${CONCURRENCY} concurrent booking attempts for the same slot...`);
  const attempts = Array.from({ length: CONCURRENCY }, (_, i) =>
    runSql(`
      INSERT INTO bookings (business_id, branch_id, service_id, staff_id, starts_at, ends_at, status, total_price, customer_name, customer_phone)
      VALUES ('${business_id}', '${branch_id}', '${service_id}', '${staff_id}', '${startsAt.toISOString()}', '${endsAt.toISOString()}', 'confirmed', 100, 'Concurrency Test ${i}', '+1000000${String(i).padStart(4, "0")}')
      RETURNING id;
    `),
  );

  const results = await Promise.all(attempts);
  const successes = results.filter((r) => Array.isArray(r) && r.length === 1 && r[0].id);
  const failures = results.filter((r) => !Array.isArray(r));
  const exclusionFailures = failures.filter(
    (r) => r.error && JSON.stringify(r.error).includes("23P01"),
  );

  console.log(`\nResults: ${successes.length} succeeded, ${failures.length} failed`);
  console.log(`Of the failures, ${exclusionFailures.length} were exclusion violations (23P01)`);
  const otherFailures = failures.filter((r) => !exclusionFailures.includes(r));
  if (otherFailures.length) {
    console.log("UNEXPECTED failure reasons:", JSON.stringify(otherFailures, null, 2));
  }

  const pass = successes.length === 1 && exclusionFailures.length === CONCURRENCY - 1;
  console.log(
    pass
      ? "\n✅ PASS: exactly one booking won the race, exclusion constraint blocked the rest."
      : "\n❌ FAIL",
  );

  console.log("\nCleaning up...");
  const successIds = successes.map((r) => r[0].id);
  await runSql(`
    DELETE FROM bookings WHERE id IN (${successIds.map((id) => `'${esc(id)}'`).join(",") || "'00000000-0000-0000-0000-000000000000'"});
    DELETE FROM staff WHERE full_name = 'Concurrency Test Staff';
    DELETE FROM services WHERE name = 'Concurrency Test Service';
    DROP TABLE IF EXISTS _concurrency_test_ids;
  `);
  console.log("Cleanup done.");

  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error("Test script error:", e);
  process.exit(1);
});
