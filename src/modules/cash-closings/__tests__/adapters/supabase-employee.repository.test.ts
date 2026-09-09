import { SupabaseEmployeeRepository } from "../../adapters/out/supabase-employee.repository.js";
import { ScopedQuery } from "../../../../infra/scoped-db/scoped-query.js";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";

/**
 * Regression test for
 * `.scratch/kiosk-pin-storage-prefix/issues/01-composite-kiosk-pin-index.md`:
 * the composite `(org_id, kiosk_pin_hash)` index this ticket adds is only
 * safe because the lookup itself already filters by organization before the
 * `kiosk_pin_hash` predicate runs. This asserts the `.eq()` call order sent
 * to the PostgREST builder, mirroring `scoped-query.test.ts`'s fake-client
 * technique (spec.md's "PostgREST builder exposes its method, URL and body
 * before any request is made" testing decision).
 */
interface RecordedFrom {
  table: string;
  eqCalls: Array<[string, unknown]>;
}

function fakeSupabaseClient() {
  const froms: RecordedFrom[] = [];

  const client = {
    from(table: string) {
      const record: RecordedFrom = { table, eqCalls: [] };
      froms.push(record);

      const builder = {
        select() {
          return builder;
        },
        eq(column: string, value: unknown) {
          record.eqCalls.push([column, value]);
          return builder;
        },
        maybeSingle() {
          return builder;
        },
      };
      return builder;
    },
  };

  return { client, froms };
}

describe("SupabaseEmployeeRepository.findActiveByPinHash", () => {
  it("filters by organization before the kiosk_pin_hash predicate", async () => {
    const { client, froms } = fakeSupabaseClient();
    const orgA = mintOrganizationId("org-a");
    const repository = new SupabaseEmployeeRepository((organizationId) =>
      ScopedQuery.create(organizationId, client as unknown as Parameters<typeof ScopedQuery.create>[1]),
    );

    await repository.findActiveByPinHash(orgA, "hashed-pin");

    expect(froms).toHaveLength(1);
    expect(froms[0]?.table).toBe("hr_employees");
    expect(froms[0]?.eqCalls).toEqual([
      ["org_id", "org-a"],
      ["kiosk_pin_hash", "hashed-pin"],
      ["status", "active"],
    ]);
  });
});
