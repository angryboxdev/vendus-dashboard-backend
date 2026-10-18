# Arquitetura técnica (backend)

Regras obrigatórias (hexagonal, dependências, testes, README): `CLAUDE.md`. Aqui ficam os factos técnicos e onde estão.

## Stack
Node + TypeScript (ESM, imports com `.js`), Express 5, Supabase (`@supabase/supabase-js`), Jest, zod, luxon, jose (JWT), OpenAI SDK, pdfkit/xlsx/pdf-to-img. Scripts: `npm run test:unit`, `typecheck`, `lint:deps` (dependency-cruiser: fronteiras hexagonais), `authz:matrix`, `build`, `check:ci`.

## Estrutura
| Caminho | Conteúdo |
|---|---|
| `src/server.ts` | Composition root global: instancia módulos, liga portas entre módulos (proxies `*Ref` para ciclos), monta routers, guards de auth, `/api/health` (devolve o commit) |
| `src/modules/<m>/` | Módulos hexagonais (`domain/`, `application/`, `adapters/`, `<m>.module.ts`, `README.md`) — ver `docs/modulos/` |
| `src/kernel/` | Puro, partilhado: `organization-id.ts` (tipo nominal), `money/` (decimal exato e motor de valores de documentos — espelhado no frontend) |
| `src/infra/scoped-db/` | Único sítio que importa `@supabase/supabase-js`. `scoped-query.ts` (todas as queries com `org_id`, ADR-0008), `table-registry.ts` (toda a tabela nova tem de ser registada), `object-storage.ts`, `request-memo.ts` (memo por pedido, ADR-0037), lookups sem âmbito justificados (convites, tokens de dispositivo) |
| `src/infra/http/` | Convenções ADR-0022: `problem-details.ts` (RFC 7807), `idempotency.ts` + `supabase-idempotency.store.ts` (`Idempotency-Key`), `etag.ts`, `correlation.ts`, `file-validation.ts` |
| `src/infra/crypto/` | Cifra de segredos de integrações na aplicação (ADR-0014) |
| `src/middleware/` | `auth-middleware.ts` (sessão Supabase → `req.auth` {orgId, role, email, sub}), `device-auth-middleware.ts` (Location Tokens para kiosk/caixa/KDS, ADR-0010) |
| `src/routes/`, `src/services/` | Camada legada — [modulos/legado.md](modulos/legado.md) |
| `src/jobs/`, `src/tools/authz-matrix/` | Scripts/cron e gerador da matriz de permissões |
| `supabase/migrations/` | Migrações (aplicadas em produção pelo preDeploy); `_archive/` = histórico antes do baseline (ADR-0006) |
| `docs/migrations/rollback/` | Um rollback por migração recente (obrigatório) |

## Permissões e segurança
- Toda a rota `/api/*` tem de estar classificada em `src/modules/access/domain/route-permissions.ts` (**fail-closed**: rota não classificada → 403 `ROUTE_NOT_CLASSIFIED`). Depois de criar rotas: `npm run authz:matrix` → `docs/matriz-autorizacao.md` (deve dar 0 não classificados).
- Autorização por perfil de acesso → permissões READ/MANAGE por funcionalidade (`access/domain/catalog.ts`), âmbitos (`access_scopes`) e privacidade por campo no Novo RH.
- Isolamento: `org_id` + scoped helper; RLS `org_id = current_org()` nas tabelas novas (rede adicional, ADR-0007/0020). Organização de demonstração com dados sintéticos na mesma BD (ADR-0021/0034).
- Segredos só em variáveis de ambiente (Render / `.env` local, ignorado pelo git). Nunca em código, docs ou chat.

## Base de dados e migrações
- Uma migração por alteração, idempotente (`if not exists` / `drop … if exists`), com rollback em `docs/migrations/rollback/`.
- Validar antes de produção: aplicar a cadeia completa num Postgres real (PGlite com stubs do Supabase), reexecutar, rollback e reaplicar, e confirmar que as colunas usadas pelos adapters existem. (O script usado vive no scratchpad da sessão — recriar se necessário.)
- Sem Docker nesta máquina: os testes `*.integration.test.ts` (stack Supabase local) não correm aqui; usar `npm run test:unit`.

## Deploy
- **API:** Render, serviço `mezza-api` (Frankfurt). Build: `check:ci` + `build` + `supabase db push --dry-run`. **preDeploy: `supabase db push`** → integrar um PR com migrações em `main` aplica-as em produção; se falharem, o deploy é abortado e a versão anterior continua. Confirmar com `GET /api/health` (commit).
- **Cron:** serviço Render separado (`cron:daily-vendus-consumption`); rotas `/api/internal/cron/*` com segredo.
- **Frontend:** Vercel, deploy em cada merge para `main`.
- Integrar sempre o backend antes do frontend quando o contrato muda.

## Contrato backend/frontend
Frontend em repositório separado (máquina atual: `C:\Users\Bruno Fontes\vendus-dashboard-frontend`), com o seu `CLAUDE.md`. Alterar endpoints/tipos de um lado obriga a ajustar o outro na mesma tarefa. O motor de valores (`src/kernel/money`, `invoices/domain/services/invoice-amounts.service.ts`) tem espelho no frontend (`src/modules/invoices/domain/services/`) com os mesmos vetores de teste — alterar os dois juntos.
