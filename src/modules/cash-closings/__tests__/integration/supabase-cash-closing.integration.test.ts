import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { CashClosing } from "../../domain/entities/cash-closing.js";
import type { ScopedQuery as ScopedQueryType, ScopedQueryFactory } from "../../../../infra/scoped-db/scoped-query.js";
import type { SupabaseCashClosingRepository as SupabaseCashClosingRepositoryType } from "../../adapters/out/supabase-cash-closing.repository.js";

/**
 * Regression test (PGRST201 investigation ticket) for the `hr_employees`
 * embed on `cash_closings.employee_id`: after the phase-2 composite-FK
 * migrations added `cash_closings_org_id_employee_id_fkey` alongside the
 * original `cash_closings_employee_id_fkey`, PostgREST's embedded
 * `hr_employees(full_name)` became ambiguous (PGRST201) unless the select
 * names the FK explicitly. `findById`/`list` already carry the fix
 * (`hr_employees!cash_closings_employee_id_fkey(full_name)`) — this test
 * guards it going forward.
 *
 * Setup pattern copied from `location-credentials`' integration test: talks
 * to the local Supabase stack (`supabase start`), mocks
 * `supabase-client.js` so `getSupabaseServiceRole()` resolves to a client
 * built here, and imports everything under test dynamically inside
 * `beforeAll`, after the mock is registered.
 */

const LOCAL_SUPABASE_URL = process.env.TEST_SUPABASE_URL ?? "http://127.0.0.1:54321";
const LOCAL_SUPABASE_SERVICE_ROLE_KEY =
  process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const localClient: SupabaseClient = createClient(LOCAL_SUPABASE_URL, LOCAL_SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

jest.mock("../../../../infra/scoped-db/supabase-client.js", () => ({
  getSupabaseServiceRole: () => localClient,
  getSupabase: () => localClient,
  isSupabaseConfigured: () => true,
  isHrSupabaseConfigured: () => true,
}));

const ANGRYBOX_ORG_ID = mintOrganizationId("b6999cff-79b2-4583-b8b4-a744b3ace748");
const ANGRYBOX_LOCATION_ID = "c11d9146-fe16-4afb-9877-75e75bb2f52a";

let scopedQuery: ScopedQueryFactory;
let SupabaseCashClosingRepository: typeof SupabaseCashClosingRepositoryType;
let employeeId: string;
const createdClosingIds: string[] = [];

beforeAll(async () => {
  const { error } = await localClient.from("cash_closings").select("id").limit(1);
  if (error) {
    throw new Error(
      `Local Supabase stack unreachable at ${LOCAL_SUPABASE_URL} (run \`supabase start\`, then \`supabase db reset\`). Underlying error: ${error.message}`,
    );
  }

  const { data: employee, error: employeeError } = await localClient
    .from("hr_employees")
    .select("id")
    .eq("org_id", ANGRYBOX_ORG_ID)
    .limit(1)
    .single();
  if (employeeError || !employee) {
    throw new Error(`Could not find a seeded hr_employees row for Angrybox: ${employeeError?.message}`);
  }
  employeeId = employee.id as string;

  const scopedQueryModule = (await import("../../../../infra/scoped-db/scoped-query.js")) as {
    ScopedQuery: typeof ScopedQueryType;
  };
  scopedQuery = (organizationId) => scopedQueryModule.ScopedQuery.create(organizationId, localClient);

  ({ SupabaseCashClosingRepository } = await import("../../adapters/out/supabase-cash-closing.repository.js"));
});

afterEach(async () => {
  if (createdClosingIds.length > 0) {
    await localClient.from("cash_closings").delete().in("id", createdClosingIds);
    createdClosingIds.length = 0;
  }
});

function newClosing(closingDate: string) {
  return CashClosing.create({
    employeeId,
    employeeName: "placeholder",
    locationId: ANGRYBOX_LOCATION_ID,
    closingDate,
    tpa: 10,
    uber: 0,
    glovo: 0,
    bolt: 0,
    eatz: 0,
    cashSales: 50,
    cashIn: 0,
    cashOut: 0,
    cashDrawerOpen: 100,
    cashDrawerTotal: 160,
    vendusTotal: 60,
  });
}

describe("SupabaseCashClosingRepository (integration, local Supabase stack)", () => {
  it("findById embeds hr_employees.full_name without a PGRST201 ambiguity error", async () => {
    const repo = new SupabaseCashClosingRepository(scopedQuery);
    const closing = newClosing("2026-01-10");
    createdClosingIds.push(closing.id);
    await repo.save(ANGRYBOX_ORG_ID, closing);

    const found = await repo.findById(ANGRYBOX_ORG_ID, closing.id);

    expect(found).not.toBeNull();
    expect(found!.employeeName.length).toBeGreaterThan(0);
  });

  it("list embeds hr_employees.full_name without a PGRST201 ambiguity error", async () => {
    const repo = new SupabaseCashClosingRepository(scopedQuery);
    const closing = newClosing("2026-01-11");
    createdClosingIds.push(closing.id);
    await repo.save(ANGRYBOX_ORG_ID, closing);

    const { closings } = await repo.list(ANGRYBOX_ORG_ID, { employeeId });

    const found = closings.find((c) => c.id === closing.id);
    expect(found).toBeDefined();
    expect(found!.employeeName.length).toBeGreaterThan(0);
  });
});
