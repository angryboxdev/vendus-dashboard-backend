# Module: access

> Status: active (new pattern)
> Last updated: 2026-10-06

## O que é e para que serve (perspetiva de negócio)
Autorização do Hub por **Perfil de acesso → permissões herdadas → exceções
individuais** (Utilizadores & Perfis de Acesso 2.0, `.scratch/utilizadores-perfis`).
Decide, em cada pedido, se o utilizador pode consultar (READ) ou gerir
(MANAGE) cada funcionalidade. Não autentica (isso é Supabase Auth +
`middleware/auth`) e não gere contas (módulo de Utilizadores, tickets 05–06).

## Technical purpose
- `domain/catalog.ts` — **fonte única** de módulos, funcionalidades,
  permissões especiais e valores iniciais dos perfis de sistema (Admin,
  Manager, RH, Financeiro, Colaborador).
- `domain/route-permissions.ts` — tabela central rota → permissão; rota de
  `/api` sem regra é recusada (falha fechada). `isRouteAllowed` é a decisão
  pura do `routeGuard`, partilhada com o gerador da matriz de autorização
  (`npm run authz:matrix` → `docs/matriz-autorizacao.md`; a CI falha se
  houver rota por classificar).
- Novo RH (Fase 1, ticket 05): perfil Geral/Específico (`access_profiles.scope_kind`), âmbitos com vigência (`access_scopes`: centro, departamento, grupo, próprio — Específico sem âmbitos não gere ninguém), privacidade por campo (`field-privacy.ts` + `access_field_privacy`; sensíveis escondidos por omissão), histórico de papéis exportável (`/access-profiles/history[.csv]`) e `canManageEmployee` usado pelos endpoints do Novo RH (fora do âmbito → 404). As alterações de acessos também vão para `audit_events`.
- Novo RH (Fase 1, ticket 06): `mfaRequired` + guarda `requireMfa` (perfis de gestão sem `aal2` → 403 `mfa_required` nas rotas de `MFA_ENFORCEMENT`: `off` | `novo-rh` (omissão) | `all`); `sessionRevoked` em `loadAccess` (token com `iat` anterior a `org_members.sessions_revoked_at` → 401 `SESSION_REVOKED`), carimbo posto ao mudar perfil/exceções ou o estado.
- `domain/services/effective-access.service.ts` — `effectivePermissions`
  (perfil + exceções, herança dinâmica), `can`, resumo por módulo,
  `sanitizePermissionMap`, `moduleBulk`.

## Ports
### Input
- `AccessAdminPort` (`AccessAdminUseCases`, tickets 05–06) — Utilizadores (listar, ver, criar com perfil + palavra-passe temporária, editar perfil/exceções/ficha ligada, desativar/reativar, repor palavra-passe, repor o segundo fator — FE-007: `POST /api/users/:id/reset-mfa`, só para outra pessoa, motivo ≥ 5, auditoria `mfa_reset`; remover o fator termina as sessões da conta) e Perfis (listar com nº de utilizadores, criar de base/duplicar, editar, desativar). Regras: nunca 0 Admins ativos; Admin e Colaborador protegidos; `version` (409); Colaborador exige ficha; 1 conta por ficha; `role` antigo sincronizado (admin→admin, colaborador→employee, restantes→manager); invalida a cache; histórico em `organization_audit_logs` (`user`, `access_profile`).
- `ResolveAccessPort` (`ResolveAccessUseCase`) — acesso efetivo lido da BD
  (perfil, exceções, estado), com cache curta (15 s) e `invalidate` chamado
  pelas escritas.
### Output
- `AccessAdminRepositoryPort`, `EmployeeLinkPort` (`hr_employees.user_id`), `AccountDirectoryPort` (Supabase Auth), `AccessAuditPort`.
- `AccessRepositoryPort` — membership (`org_members`: `profile_id`,
  `permission_overrides`, `status`, `version`, `role` antigo) e perfis
  (`access_profiles`).

## Adapters
### Input
- `access-guards.ts` — `loadAccess` (global após `requireAuth`; conta
  desativada → 403 `USER_DISABLED`), `routeGuard` (global; aplica a tabela),
  `requirePermission`, `requireAdmin`.
- `access-admin.controller.ts` — `/api/users*`, `/api/users/employee-options`, `/api/access-profiles*` (só Admin pela tabela central).
- `access-me.controller.ts` — `GET /api/me/access` (acesso efetivo + catálogo
  para o frontend adaptar menus/botões).
### Output
- `SupabaseAccessRepository`, `SupabaseAccessAdminRepository`, `SupabaseEmployeeLinkAdapter`, `SupabaseAccessAudit` — scoped query; `SupabaseAccountDirectory` — `authAdmin`.

## Design decisions (ADR summary)
- **Fonte da verdade = BD por pedido**, não o token: revogação/desativação
  valem no pedido seguinte (cache ≤ 15 s entre instâncias; invalidação
  imediata na instância que escreve).
- **Tabela central em vez de guardas espalhadas**: substitui os
  `requireMinRole("manager")` no mount — que, montados em `app.use("/api", …)`,
  se aplicavam a TODO o `/api` seguinte (o Visualizador RH levava 403 em todo
  o RH; corrigido). Os `requireMinRole("admin")` inline passaram a
  permissões (Empresa, Locais, Feriados, Dispositivos, Reabrir mês, Importar
  recibos, previsão de stock); contagens usam `can(stock.count_confirm)`.
- **Regras de visibilidade por papel** (mascaramento RH, documentos da
  Empresa, calendário) derivam agora das permissões (`hr.sensitive_data`,
  `company.documents`, `company.confidential_documents`).
- **Admin** tem sempre tudo; **Colaborador** nunca tem módulos de gestão
  (exceções ignoradas). Membership sem `profile_id` usa o perfil de sistema
  do papel antigo.
- Migração `20261008110000_access_profiles.sql` gerada do catálogo
  (`scripts/generate-access-profiles-seed.ts`); um teste garante que não
  divergem.

## How to test
`npx jest src/modules/access`

## Known gaps / open debt
- `PATCH /api/hr/employees/:id/kiosk-pin` está montado antes da
  autenticação global (legado do quiosque) e continua `requireMinRole("admin")`
  — a permissão especial `hr.kiosk_pin` só vale para Admin até esse router
  ser migrado.
- Os `requireMinRole("manager")` inline que restam são inócuos enquanto o
  `role` for sincronizado com o perfil (admin→admin, colaborador→employee,
  restantes→manager — ticket 05).
