import { Router, type Request, type Response } from "express";
import { AccessConflictError, AccessNotFoundError, AccessValidationError, LastAdminError, ProtectedProfileError } from "../../domain/errors.js";
import type { AccessAdminPort } from "../../domain/ports/in/access-admin.ports.js";

function handleError(e: unknown, res: Response): void {
  if (e instanceof AccessValidationError) {
    res.status(400).json({ error: e.message });
    return;
  }
  if (e instanceof AccessConflictError) {
    res.status(409).json({ error: e.message, code: "VERSION_CONFLICT" });
    return;
  }
  if (e instanceof LastAdminError) {
    res.status(409).json({ error: e.message, code: "LAST_ADMIN" });
    return;
  }
  if (e instanceof ProtectedProfileError) {
    res.status(409).json({ error: e.message, code: "PROTECTED_PROFILE" });
    return;
  }
  if (e instanceof AccessNotFoundError) {
    res.status(404).json({ error: e.message });
    return;
  }
  res.status(500).json({ error: e instanceof Error ? e.message : "Internal error" });
}

const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const version = (v: unknown) => (typeof v === "number" && Number.isInteger(v) ? v : -1);
const who = (req: Request) => ({ organizationId: req.auth!.orgId, actor: req.auth!.email, actorUserId: req.auth!.sub });
const id = (req: Request) => req.params.id as string;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Utilizadores & Perfis de Acesso (tickets 05–06). Só Admin: `/users` e
 * `/access-profiles` estão classificados como `admin` na tabela central de
 * rotas (`route-permissions.ts`) — aqui não se repete a verificação.
 */
export function createAccessAdminRouter(admin: AccessAdminPort): Router {
  const router = Router();
  const run = (fn: (req: Request) => Promise<unknown>) => async (req: Request, res: Response) => {
    try {
      res.json(await fn(req));
    } catch (e) {
      handleError(e, res);
    }
  };

  router.get("/users", run((req) => admin.listUsers(req.auth!.orgId)));
  router.get("/users/employee-options", run((req) => admin.listEmployeeOptions(req.auth!.orgId)));
  router.get("/users/:id", run((req) => admin.getUser(req.auth!.orgId, id(req))));
  router.post(
    "/users",
    run((req) => {
      const b = (req.body ?? {}) as Record<string, unknown>;
      return admin.createUser({ ...who(req), email: str(b.email) ?? "", profileId: str(b.profileId) ?? "", employeeId: str(b.employeeId) || null });
    }),
  );
  router.patch(
    "/users/:id",
    run((req) => {
      const b = (req.body ?? {}) as Record<string, unknown>;
      return admin.updateUser({
        ...who(req),
        userId: id(req),
        version: version(b.version),
        ...(str(b.profileId) && { profileId: str(b.profileId)! }),
        ...(isObject(b.overrides) ? { overrides: b.overrides } : {}),
        ...("employeeId" in b && { employeeId: str(b.employeeId) || null }),
      });
    }),
  );
  router.patch(
    "/users/:id/status",
    run((req) => {
      const b = (req.body ?? {}) as Record<string, unknown>;
      if (b.status !== "active" && b.status !== "disabled") throw new AccessValidationError("Estado inválido");
      return admin.setUserStatus({ ...who(req), userId: id(req), version: version(b.version), status: b.status });
    }),
  );
  router.post("/users/:id/reset-password", run((req) => admin.resetPassword({ ...who(req), userId: id(req) })));

  router.get("/access-profiles", run((req) => admin.listProfiles(req.auth!.orgId)));
  router.post(
    "/access-profiles",
    run((req) => {
      const b = (req.body ?? {}) as Record<string, unknown>;
      return admin.createProfile({ ...who(req), name: str(b.name) ?? "", description: str(b.description) ?? null, baseProfileId: str(b.baseProfileId) || null });
    }),
  );
  router.patch(
    "/access-profiles/:id",
    run((req) => {
      const b = (req.body ?? {}) as Record<string, unknown>;
      return admin.updateProfile({
        ...who(req),
        profileId: id(req),
        version: version(b.version),
        ...(str(b.name) !== undefined && { name: str(b.name)! }),
        ...("description" in b && { description: str(b.description) ?? null }),
        ...(isObject(b.permissions) ? { permissions: b.permissions } : {}),
      });
    }),
  );
  router.patch(
    "/access-profiles/:id/active",
    run((req) => {
      const b = (req.body ?? {}) as Record<string, unknown>;
      if (typeof b.active !== "boolean") throw new AccessValidationError("active deve ser booleano");
      return admin.setProfileActive({ ...who(req), profileId: id(req), version: version(b.version), active: b.active });
    }),
  );
  return router;
}
