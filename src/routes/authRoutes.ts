import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { authAdmin } from "../infra/scoped-db/auth-admin.js";
import { listMembershipsForUser } from "../infra/scoped-db/membership-lookup.js";
import { createScopedQuery } from "../infra/scoped-db/scoped-query.js";
import type { OrganizationId } from "../kernel/organization-id.js";

export const authRoutes = Router();

function jsonError(res: Response, status: number, message: string) {
  res.status(status).json({ error: message });
}

const createUserSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(8, "Password deve ter pelo menos 8 caracteres"),
  role: z.enum(["admin", "manager", "hr_viewer"]),
});

const updateUserSchema = z.object({
  role: z.enum(["admin", "manager", "hr_viewer"]).optional(),
  password: z.string().min(8).optional(),
});

/**
 * `org_members` row shapes read through the scoped-query helper.
 *
 * The helper's `select()` is deliberately typed as a plain `string`, not a
 * literal (see `ScopedQuery`'s own doc comment for why), so the builder
 * can't parse a row shape from the column list and its result types as the
 * client's untyped fallback. Every read below casts through one of these two
 * shapes instead of repeating the cast inline at each call site.
 */
interface MembershipRow {
  role: string;
  created_at: string;
  updated_at: string;
}
interface MembershipRowWithUserId extends MembershipRow {
  user_id: string;
}

function asMembershipRow(data: unknown): MembershipRow {
  return data as MembershipRow;
}

function asMembershipRowsWithUserId(data: unknown): MembershipRowWithUserId[] {
  return (data as MembershipRowWithUserId[] | null) ?? [];
}

/**
 * Resolves emails for a set of `auth.users` ids via the paginated admin user
 * listing. PostgREST cannot join into the `auth` schema, so the user listing
 * below joins `org_members` against this in memory (D4/ticket 04). A
 * restaurant has on the order of ten users — a single page is the realistic
 * case — but this still walks every page until every id is found or the
 * listing is exhausted, rather than assuming one page is enough.
 */
async function resolveEmailsById(ids: Set<string>): Promise<Map<string, string>> {
  const emailsById = new Map<string, string>();
  const perPage = 1000;
  let page = 1;

  while (emailsById.size < ids.size) {
    const { data, error } = await authAdmin.listUsers(page, perPage);
    if (error) throw new Error(error.message);

    for (const user of data.users) {
      if (ids.has(user.id)) emailsById.set(user.id, user.email ?? "");
    }

    if (data.users.length < perPage) break; // last page
    page += 1;
  }

  return emailsById;
}

/**
 * Membership row for the caller's organization and the given user, or null
 * when the user is not a member of that organization — including when the
 * identifier doesn't exist at all. Callers turn null into a generic 404 so a
 * guessed id reveals nothing (D8).
 */
async function findMembership(orgId: OrganizationId, userId: string): Promise<MembershipRow | null> {
  const { data, error } = await createScopedQuery(orgId)
    .table("org_members")
    .select("role, created_at, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? asMembershipRow(data) : null;
}

// GET /api/auth/me — utilizador autenticado actual
authRoutes.get("/me", (req: Request, res: Response) => {
  res.json({
    id: req.auth!.sub,
    email: req.auth!.email,
    role: req.auth!.orgRole,
  });
});

// GET /api/auth/users — lista utilizadores da organização do chamador
authRoutes.get("/users", async (req: Request, res: Response) => {
  try {
    const { data, error } = await createScopedQuery(req.auth!.orgId)
      .table("org_members")
      .select("user_id, role, created_at, updated_at")
      .order("created_at", { ascending: true });

    if (error) { jsonError(res, 500, error.message); return; }
    const members = asMembershipRowsWithUserId(data);
    if (members.length === 0) { res.json([]); return; }

    const emailsById = await resolveEmailsById(new Set(members.map((m) => m.user_id)));

    res.json(
      members.map((m) => ({
        id: m.user_id,
        email: emailsById.get(m.user_id) ?? "",
        role: m.role,
        created_at: m.created_at,
        updated_at: m.updated_at,
      })),
    );
  } catch (e: unknown) {
    jsonError(res, 500, e instanceof Error ? e.message : "Erro ao listar utilizadores");
  }
});

// POST /api/auth/users — criar utilizador e a sua membership na organização do chamador
authRoutes.post("/users", async (req: Request, res: Response) => {
  try {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      jsonError(res, 400, parsed.error.issues.map((i) => i.message).join("; "));
      return;
    }
    const { email, password, role } = parsed.data;

    // Criar na Supabase Auth
    const { data: authData, error: authError } = await authAdmin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (authError) {
      const status = authError.message.toLowerCase().includes("already") ? 409 : 500;
      jsonError(res, status, authError.message);
      return;
    }

    const userId = authData.user.id;

    // Criar a membership na organização do chamador — stamped pelo helper.
    const { data: inserted, error } = await createScopedQuery(req.auth!.orgId)
      .table("org_members")
      .insert({ user_id: userId, role })
      .select("role, created_at, updated_at")
      .single();

    if (error) {
      // Tentar limpar o utilizador criado no Auth para não deixar órfãos
      await authAdmin.deleteUser(userId);
      jsonError(res, 500, error.message);
      return;
    }
    const data = asMembershipRow(inserted);
    res.status(201).json({
      id: userId,
      email,
      role: data.role,
      created_at: data.created_at,
      updated_at: data.updated_at,
    });
  } catch (e: unknown) {
    jsonError(res, 500, e instanceof Error ? e.message : "Erro ao criar utilizador");
  }
});

// PATCH /api/auth/users/:id — actualizar role e/ou password de um membro da organização do chamador
authRoutes.patch("/users/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params["id"] as string;
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      jsonError(res, 400, parsed.error.issues.map((i) => i.message).join("; "));
      return;
    }
    const { role, password } = parsed.data;
    if (!role && !password) {
      jsonError(res, 400, "Indica role e/ou password para actualizar");
      return;
    }

    // Não-membro comporta-se como inexistente, real ou não (D8).
    const membership = await findMembership(req.auth!.orgId, id);
    if (!membership) { jsonError(res, 404, "Utilizador não encontrado"); return; }

    // Actualizar password se fornecida
    if (password) {
      const { error: pwError } = await authAdmin.updateUserPassword(id, password);
      if (pwError) { jsonError(res, 500, pwError.message); return; }
    }

    const { data: authUser, error: authUserError } = await authAdmin.getUserById(id);
    if (authUserError || !authUser.user) { jsonError(res, 404, "Utilizador não encontrado"); return; }

    // Actualizar role se fornecido — filtrado e stamped pelo helper.
    if (role) {
      const { data: updated, error } = await createScopedQuery(req.auth!.orgId)
        .table("org_members")
        .update({ role, updated_at: new Date().toISOString() })
        .eq("user_id", id)
        .select("role, created_at, updated_at")
        .single();

      if (error) { jsonError(res, 500, error.message); return; }
      const data = asMembershipRow(updated);
      res.json({
        id,
        email: authUser.user.email ?? "",
        role: data.role,
        created_at: data.created_at,
        updated_at: data.updated_at,
      });
      return;
    }

    // Só actualizou password — devolver o estado actual da membership
    res.json({
      id,
      email: authUser.user.email ?? "",
      role: membership.role,
      created_at: membership.created_at,
      updated_at: membership.updated_at,
    });
  } catch (e: unknown) {
    jsonError(res, 500, e instanceof Error ? e.message : "Erro ao actualizar utilizador");
  }
});

// DELETE /api/auth/users/:id — remove a membership na organização do chamador;
// elimina a conta apenas se essa era a última membership da pessoa.
authRoutes.delete("/users/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params["id"] as string;

    // Não permitir auto-eliminação
    if (id === req.auth!.sub) {
      jsonError(res, 400, "Não podes eliminar a tua própria conta");
      return;
    }

    // Não-membro comporta-se como inexistente, real ou não (D8).
    const membership = await findMembership(req.auth!.orgId, id);
    if (!membership) { jsonError(res, 404, "Utilizador não encontrado"); return; }

    const { error: deleteMembershipError } = await createScopedQuery(req.auth!.orgId)
      .table("org_members")
      .delete()
      .eq("user_id", id);
    if (deleteMembershipError) { jsonError(res, 500, deleteMembershipError.message); return; }

    // Só elimina a conta se esta era a última membership da pessoa — em
    // QUALQUER organização, não só na do chamador — revogar aqui não pode
    // tocar no acesso a outra organização (D8/spec §removal rule). Esta é a
    // segunda consumidora do único primitivo unscoped (D10): saber se a
    // pessoa pertence a alguma organização é inerentemente uma pergunta
    // cross-tenant.
    const remaining = await listMembershipsForUser(id);

    if (remaining.length === 0) {
      const { error: deleteUserError } = await authAdmin.deleteUser(id);
      if (deleteUserError) {
        const status = deleteUserError.message.toLowerCase().includes("not found") ? 404 : 500;
        jsonError(res, status, deleteUserError.message);
        return;
      }
    }

    res.status(204).send();
  } catch (e: unknown) {
    jsonError(res, 500, e instanceof Error ? e.message : "Erro ao eliminar utilizador");
  }
});
