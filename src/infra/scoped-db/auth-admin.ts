import { getSupabaseServiceRole } from "./supabase-client.js";

/**
 * The auth-admin wrapper (item 6, D10, ADR-0008). Moved here from
 * `src/routes/authRoutes.ts` because D10's import rule requires it: these
 * are Supabase Auth admin operations, sitting behind the same client as
 * every database query.
 *
 * `auth.users` has no organization column — user *accounts* aren't
 * org-scoped, org *memberships* are (`org_members`, via the scoped query
 * helper). These operations are named individually rather than exposed as a
 * raw client so the folder-import rule stays meaningful here too: adding a
 * sixth admin operation means naming it here, not reaching for the client
 * directly from a route.
 */

function client() {
  const supabase = getSupabaseServiceRole();
  if (!supabase) throw new Error("Supabase service role não configurado");
  return supabase;
}

export const authAdmin = {
  listUsers(page: number, perPage: number) {
    return client().auth.admin.listUsers({ page, perPage });
  },

  createUser(params: { email: string; password: string; email_confirm: boolean }) {
    return client().auth.admin.createUser(params);
  },

  getUserById(userId: string) {
    return client().auth.admin.getUserById(userId);
  },

  updateUserPassword(userId: string, password: string) {
    return client().auth.admin.updateUserById(userId, { password });
  },

  deleteUser(userId: string) {
    return client().auth.admin.deleteUser(userId);
  },
};
