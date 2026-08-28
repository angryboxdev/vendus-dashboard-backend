/**
 * Job: provision a new organization end-to-end — the org, its first
 * location, its first auth user and that user's `admin` membership — in one
 * run. See `.scratch/tenant-identity/issues/05-organization-provisioning-script.md`
 * and spec.md D7 for why this is a script and not an endpoint: an endpoint
 * that creates organizations needs a privileged concept to authorize it, and
 * such a request is legitimately unscoped, which is exactly the escape hatch
 * §2.6 warns gets reused. Keeping provisioning outside the request path keeps
 * the rule governing scoped-query call sites absolute.
 *
 * The created admin's access is an ordinary `org_members` row like anyone
 * else's — there is no platform-administrator concept anywhere in this
 * codebase, and this script does not create one.
 *
 * ---------------------------------------------------------------------------
 * ORGANIZATION #2 GATE — read this before running against anything but the
 * local stack.
 *
 * No second `organizations` row may exist in PRODUCTION until all four of
 * the deferred register's blocking items have landed:
 *
 *   1. device identity for the user-less paths (kiosk / webhook flows that
 *      don't carry a JWT and so can't get org_id from a claim)
 *   2. org-claim RLS policies + storage path prefixing
 *   3. composite keys and indexes (org-scoped uniqueness/perf work)
 *   4. seed template data (channel list, cost centre groups/categories,
 *      stock categories, public holidays for a real new customer)
 *
 * Locally this script SHOULD create a second organization — a second org on
 * the local stack is the only way to exercise any multi-organization code
 * path at all. This is a documentation gate, not an enforced one: the script
 * does not check which environment it's running against and will not refuse
 * to run. Whoever runs this against production is the one accountable for
 * checking those four items have landed first.
 * ---------------------------------------------------------------------------
 *
 * Uso:
 *   npm run org:provision:dev
 *
 * The script prompts interactively on the terminal for every org/location/
 * admin parameter (org name, NIF, address, email, location name/code/
 * timezone, admin email/password) — nothing is read from `.env` for these.
 * Only Supabase connection details (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)
 * still come from the environment, since those identify *where* to run
 * against, not *what* to provision.
 *
 * Prod (depois de `npm run build`): npm run org:provision.
 */
import "../config/env.js";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { getSupabaseServiceRole } from "../infra/scoped-db/supabase-client.js";
import {
  provisionOrganization,
  DuplicateOrganizationNifError,
  type ProvisionOrganizationDeps,
  type ProvisionOrganizationInput,
} from "../services/organizationProvisioningService.js";

const GATE_BANNER = `
================================================================================
ORGANIZATION #2 GATE
No second "organizations" row in PRODUCTION until all four land:
  1. device identity for user-less paths (kiosk / webhook flows)
  2. org-claim RLS policies + storage path prefixing
  3. composite keys and indexes
  4. seed template data (channel list, cost centre groups/categories,
     stock categories, public holidays)
This script does not check the environment and will not refuse to run — the
gate is a reminder, not an enforcement. Locally, a second organization is
expected and needed to exercise multi-organization code paths at all.
================================================================================
`;

/** Re-asks `query` on a shared readline interface until a non-blank answer
 * is given. */
async function promptRequired(rl: ReturnType<typeof createInterface>, query: string): Promise<string> {
  for (;;) {
    const answer = (await rl.question(query)).trim();
    if (answer) return answer;
    console.log("  → required, please enter a value.");
  }
}

/** Blank input means "skip" for optional fields. */
async function promptOptional(rl: ReturnType<typeof createInterface>, query: string): Promise<string | undefined> {
  const answer = (await rl.question(query)).trim();
  return answer || undefined;
}

/** Reads a line from stdin with each keystroke echoed as `*`, so the admin
 * password isn't shown in plaintext on the terminal. Runs stdin in raw mode
 * for the duration of the prompt, independent of the shared readline
 * interface (which must be closed before this is called). */
function promptPassword(query: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!stdin.isTTY) {
      // No TTY (e.g. piped input in CI) — fall back to a plain readline
      // prompt since raw mode isn't available.
      const rl = createInterface({ input: stdin, output: stdout });
      rl.question(query).then((value) => {
        rl.close();
        resolve(value);
      }, reject);
      return;
    }

    stdout.write(query);
    let value = "";

    const onData = (chunk: Buffer) => {
      const str = chunk.toString("utf8");
      switch (str) {
        case "\n":
        case "\r":
        case "\u0004": // Ctrl-D
          cleanup();
          stdout.write("\n");
          resolve(value);
          break;
        case "\u0003": // Ctrl-C
          cleanup();
          stdout.write("\n");
          process.exit(1);
        case "\u007f": // Backspace
        case "\b":
          if (value.length > 0) {
            value = value.slice(0, -1);
            stdout.write("\b \b");
          }
          break;
        default:
          value += str;
          stdout.write("*".repeat(str.length));
          break;
      }
    };

    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
    };

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    stdin.on("data", onData);
  });
}

async function promptPasswordRequired(query: string): Promise<string> {
  for (;;) {
    const value = await promptPassword(query);
    if (value.trim()) return value.trim();
    console.log("  → required, please enter a value.");
  }
}

async function promptForInput(): Promise<ProvisionOrganizationInput> {
  const rl = createInterface({ input: stdin, output: stdout });
  console.log("Provision a new organization — enter the details below.\n");

  const orgName = await promptRequired(rl, "Organization name: ");
  const orgNif = await promptRequired(rl, "Organization NIF: ");
  const orgAddress = await promptOptional(rl, "Organization address (optional): ");
  const orgEmail = await promptOptional(rl, "Organization email (optional): ");
  const locationName = await promptRequired(rl, "Location name: ");
  const locationCode = await promptRequired(rl, "Location code: ");
  const locationTimezone = await promptOptional(
    rl,
    "Location timezone (optional, default Europe/Lisbon): ",
  );
  const adminEmail = await promptRequired(rl, "Admin email: ");

  rl.close();

  const adminPassword = await promptPasswordRequired("Admin password: ");

  const input: ProvisionOrganizationInput = {
    orgName,
    orgNif,
    locationName,
    locationCode,
    adminEmail,
    adminPassword,
  };
  if (orgAddress) input.orgAddress = orgAddress;
  if (orgEmail) input.orgEmail = orgEmail;
  if (locationTimezone) input.locationTimezone = locationTimezone;
  return input;
}

/** True for a Postgres unique_violation (SQLSTATE 23505), matched defensively
 * on the error code first and falling back to the message since supabase-js's
 * PostgrestError typing doesn't guarantee `code` is populated on every path. */
function isUniqueViolation(error: { code?: string; message: string }): boolean {
  return error.code === "23505" || /duplicate key value violates unique constraint/i.test(error.message);
}

function buildDeps(): ProvisionOrganizationDeps {
  const supabase = getSupabaseServiceRole();
  if (!supabase) {
    console.error(
      "Supabase indisponível (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY em falta)",
    );
    process.exit(1);
  }

  return {
    async createOrganization({ name, nif, address, email }) {
      const { data, error } = await supabase
        .from("organizations")
        .insert({ name, nif, address: address ?? null, email: email ?? null })
        .select("id, name, nif")
        .single();
      if (error) {
        if (isUniqueViolation(error)) {
          throw new DuplicateOrganizationNifError(nif);
        }
        throw new Error(`Criar organização: ${error.message}`);
      }
      return { id: data.id, name: data.name, nif: data.nif };
    },

    async createLocation({ orgId, name, code, timezone }) {
      const { data, error } = await supabase
        .from("locations")
        .insert({ org_id: orgId, name, code, timezone })
        .select("id, org_id, name, code")
        .single();
      if (error) {
        throw new Error(`Criar location: ${error.message}`);
      }
      return { id: data.id, orgId: data.org_id, name: data.name, code: data.code };
    },

    async createAdminAuthUser({ email, password }) {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error) {
        throw new Error(`Criar utilizador auth: ${error.message}`);
      }
      return { id: data.user.id, email: data.user.email ?? email };
    },

    async createMembership({ orgId, userId }) {
      const { data, error } = await supabase
        .from("org_members")
        .insert({ org_id: orgId, user_id: userId, role: "admin" })
        .select("org_id, user_id, role")
        .single();
      if (error) {
        throw new Error(`Criar membership: ${error.message}`);
      }
      return { orgId: data.org_id, userId: data.user_id, role: "admin" };
    },

    async deleteOrganization(orgId) {
      const { error } = await supabase.from("organizations").delete().eq("id", orgId);
      if (error) throw new Error(`Apagar organização ${orgId}: ${error.message}`);
    },

    async deleteLocation(locationId) {
      const { error } = await supabase.from("locations").delete().eq("id", locationId);
      if (error) throw new Error(`Apagar location ${locationId}: ${error.message}`);
    },

    async deleteAuthUser(userId) {
      const { error } = await supabase.auth.admin.deleteUser(userId);
      if (error) throw new Error(`Apagar utilizador auth ${userId}: ${error.message}`);
    },
  };
}

async function main() {
  console.log(GATE_BANNER);

  const input = await promptForInput();
  const deps = buildDeps();

  const result = await provisionOrganization(input, deps);

  console.log(
    JSON.stringify(
      {
        organization: result.organization,
        location: result.location,
        admin_user: result.adminUser,
        membership: result.membership,
      },
      null,
      2,
    ),
  );

  console.log(GATE_BANNER);
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    if (err instanceof DuplicateOrganizationNifError) {
      console.error(err.message);
      process.exit(1);
    }
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
