import type { Router } from "express";
import { createScopedQuery } from "../../infra/scoped-db/scoped-query.js";
import { SupabaseIdempotencyStore } from "../../infra/http/supabase-idempotency.store.js";
import type { OrganizationId } from "../../kernel/organization-id.js";
import { createAccessGovernanceRouter } from "./adapters/in/access-governance.controller.js";
import { SupabaseAccessGovernanceRepository, SupabaseEmployeeUnits } from "./adapters/out/supabase-access-governance.adapters.js";
import { AccessGovernanceUseCases } from "./application/use-cases/access-governance.use-cases.js";
import type { AccessAuditPort } from "./domain/ports/out/access-admin.port.js";
import { SupabaseAccessRepository } from "./adapters/out/supabase-access.repository.js";
import { ResolveAccessUseCase } from "./application/use-cases/resolve-access.use-case.js";
import { createAccessGuards, type AccessGuards } from "./adapters/in/access-guards.js";
import { createAccessMeRouter } from "./adapters/in/access-me.controller.js";
import type { ResolveAccessPort } from "./domain/ports/in/resolve-access.port.js";
import type { MfaEnforcement } from "./domain/route-permissions.js";
import { AccessAdminUseCases } from "./application/use-cases/access-admin.use-cases.js";
import { createAccessAdminRouter } from "./adapters/in/access-admin.controller.js";
import {
  SupabaseAccessAdminRepository,
  SupabaseAccessAudit,
  SupabaseAccountDirectory,
  SupabaseEmployeeLinkAdapter,
} from "./adapters/out/supabase-access-admin.adapters.js";

export interface AccessModule {
  resolveAccess: ResolveAccessPort;
  guards: AccessGuards;
  /** `/me/access` — montar a seguir a `loadAccess`. */
  meRouter: Router;
  /** Utilizadores & Perfis (`/users`, `/access-profiles`) — só Admin pela tabela central de rotas. */
  adminRouter: Router;
  /** Novo RH (ticket 05): tipo de perfil, âmbitos, privacidade por campo, histórico — montar antes do adminRouter. */
  governanceRouter: Router;
  governance: AccessGovernanceUseCases;
}

/** Dependências do Novo RH (opcionais para os testes antigos). */
export interface AccessModuleOptions {
  mfa: MfaEnforcement;
  /** Departamentos/grupos de um colaborador (módulo org-structure). */
  orgUnits?: (org: OrganizationId, employeeId: string, date: string) => Promise<{ departmentIds: string[]; groupIds: string[]; locationIds?: string[] | null }>;
  /** Auditoria transversal encadeada (módulo audit): as alterações de papéis também lá ficam. */
  transversalAudit?: {
    record(org: OrganizationId, e: { actor: string; action: string; resourceType: string; resourceId: string | null; before: unknown; after: unknown; reason: string | null }): Promise<void>;
  };
}

/** Composition root do motor de autorização (Utilizadores & Perfis de Acesso 2.0). */
export function createAccessModule(options: AccessModuleOptions = { mfa: "off" }): AccessModule {
  const resolveAccess = new ResolveAccessUseCase(new SupabaseAccessRepository(createScopedQuery));
  const orgAudit = new SupabaseAccessAudit(createScopedQuery);
  const audit: AccessAuditPort = {
    async record(e) {
      await orgAudit.record(e);
      await options.transversalAudit?.record(e.organizationId, {
        actor: e.actor,
        action: `access.${e.entityType}.${e.action}`,
        resourceType: e.entityType,
        resourceId: e.entityId,
        before: e.before ?? null,
        after: e.after ?? null,
        reason: null,
      });
    },
  };
  const adminRepo = new SupabaseAccessAdminRepository(createScopedQuery);
  const admin = new AccessAdminUseCases(adminRepo, new SupabaseEmployeeLinkAdapter(createScopedQuery), new SupabaseAccountDirectory(), audit, resolveAccess);
  const governance = new AccessGovernanceUseCases(
    new SupabaseAccessGovernanceRepository(createScopedQuery),
    adminRepo,
    new SupabaseEmployeeUnits(createScopedQuery, options.orgUnits ?? (async () => ({ departmentIds: [], groupIds: [] }))),
    audit,
    (org, userId) => resolveAccess.invalidate(org, userId),
  );
  return {
    resolveAccess,
    guards: createAccessGuards(resolveAccess, { mfa: options.mfa }),
    meRouter: createAccessMeRouter(),
    adminRouter: createAccessAdminRouter(admin),
    governanceRouter: createAccessGovernanceRouter(governance, new SupabaseIdempotencyStore(createScopedQuery)),
    governance,
  };
}
