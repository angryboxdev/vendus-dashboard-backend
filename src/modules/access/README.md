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
  `/api` sem regra é recusada (falha fechada).
- `domain/services/effective-access.service.ts` — `effectivePermissions`
  (perfil + exceções, herança dinâmica), `can`, resumo por módulo,
  `sanitizePermissionMap`, `moduleBulk`.

## Ports
### Input
- `ResolveAccessPort` (`ResolveAccessUseCase`) — acesso efetivo lido da BD
  (perfil, exceções, estado), com cache curta (15 s) e `invalidate` chamado
  pelas escritas.
### Output
- `AccessRepositoryPort` — membership (`org_members`: `profile_id`,
  `permission_overrides`, `status`, `version`, `role` antigo) e perfis
  (`access_profiles`).

## Adapters
### Input
- `access-guards.ts` — `loadAccess` (global após `requireAuth`; conta
  desativada → 403 `USER_DISABLED`), `routeGuard` (global; aplica a tabela),
  `requirePermission`, `requireAdmin`.
- `access-me.controller.ts` — `GET /api/me/access` (acesso efetivo + catálogo
  para o frontend adaptar menus/botões).
### Output
- `SupabaseAccessRepository` — scoped query.

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
