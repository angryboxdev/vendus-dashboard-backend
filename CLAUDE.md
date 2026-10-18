# CLAUDE.md — Angry Box App Hub (backend)

Regras para **todo** o trabalho de código. Se um pedido entrar em conflito com elas, parar e avisar antes de avançar.

## Onde está o contexto (ler só o necessário)
1. Este ficheiro (sempre).
2. `docs/02_ESTADO_ATUAL.md` — o que está feito, em curso, próxima tarefa e pendências (ler ao retomar trabalho).
3. `docs/modulos/<modulo>.md` — só os módulos que a tarefa toca; depois o `src/modules/<modulo>/README.md` desse módulo.
4. Conforme a necessidade: `docs/00_VISAO_GERAL.md` (mapa de módulos), `docs/01_ARQUITETURA.md` (infra, permissões, migrações, deploy), `docs/03_DECISOES.md` (decisões aprovadas e processo), `docs/04_FRONTEND.md` (frontend: arquitetura, caminhos, onde continuar), `CONTEXT.md` (glossário), `docs/adr/` (decisões detalhadas), `docs/matriz-autorizacao.md` (rotas e permissões).
5. Tasks em curso e specs: `.scratch/<feature>/` (ex.: `.scratch/financeiro-stock-v1-2/`).

Não reler histórico de conversas: o estado vive nestes ficheiros. Ao concluir trabalho relevante, atualizar `docs/02_ESTADO_ATUAL.md` e o doc do módulo.

## Projeto
Backoffice para restauração (Angry Box → SaaS multi-organização): caixa, vendas, faturas, contas a pagar, bancos, stock, RH e Novo RH. API Express 5 + TypeScript sobre Supabase (Postgres, Auth, Storage); testes Jest. Antes de escrever código, ler `package.json` e configs e seguir as convenções existentes. **Não acrescentar dependências sem perguntar.**

## Repositórios (backend + frontend)
O produto vive em dois repositórios e **estas regras aplicam-se aos dois** (mesma arquitetura hexagonal, mesma estrutura `src/modules/`, mesmo lint de fronteiras, mesma disciplina de testes e documentação).
- **Backend** — este repositório.
- **Frontend** — repositório separado. Nesta máquina: `C:\Users\Bruno Fontes\vendus-dashboard-frontend` (na máquina do Raul: `/Users/raulafonso/Documents/r4ff/vendus-dashboard/vendus-dashboard-frontend`).

|           | Adaptador de entrada        | Adaptador de saída            | O domínio NÃO importa               |
| --------- | --------------------------- | ----------------------------- | ----------------------------------- |
| Backend   | controller HTTP, CLI, consumer | repositório BD, gateway API, fila | ORM, cliente BD, SDK HTTP        |
| Frontend  | componente/hook de UI       | cliente HTTP/API, storage     | React, `fetch`/axios, APIs DOM      |

No frontend: ler o `CLAUDE.md` e o módulo de referência do próprio repositório; typecheck com `npx tsc -p tsconfig.app.json --noEmit`. **Manter o contrato sincronizado:** mudar endpoints, formatos ou tipos partilhados de um lado obriga a ajustar o outro na mesma tarefa (e avisar se ficar incompatível).

## Estado do projeto
Migração gradual para hexagonal. A maior parte do código antigo (`src/routes`, `src/services`) é legado — **nunca imitar**. Ver `docs/agents/project-status.md`. Refactors de legado são graduais, módulo a módulo, nunca em big bang — ler `docs/agents/legacy-module-refactor.md` e perguntar antes de começar.

## Arquitetura hexagonal (ports & adapters)
Todo o módulo novo, em `src/modules/<modulo>/`:
```
domain/      entities/ (sem dependências externas) · ports/in/ (casos de uso) · ports/out/ (repos/gateways) · services/ (lógica pura)
application/ use-cases/ (implementam as portas de entrada, orquestram o domínio)
adapters/    in/ (http, cli, consumers) · out/ (bd, apis, filas)
<modulo>.module.ts   composition root: monta o módulo e injeta adapters
README.md            documentação (docs/agents/module-readme-template.md)
```
**Módulo de referência:** `src/modules/tasks` — o único molde; na dúvida sobre onde algo pertence, copiar o seu padrão; nunca copiar um módulo legado.

**Regras de dependência (inegociáveis):**
1. `domain/` não importa de `adapters/`, `application/` nem de bibliotecas de infra. Precisa de algo externo → declara uma porta de saída.
2. Dependências cruzam por interface; os casos de uso recebem as portas no construtor.
3. Só o composition root conhece adapters concretos (nos testes entram fakes). Entre módulos: portas de entrada do outro módulo, ligadas em `src/server.ts`.
4. `src/kernel` é puro e partilhado; só `src/infra/scoped-db` importa `@supabase/supabase-js`.

As setas de dependência apontam sempre para o domínio. Verificação: `npm run lint:deps`.

## Antes de alterar um módulo
1. Ver o `Status` no README do módulo. Se for **legado**: alteração mínima; se for grande, sugerir migrar primeiro (`docs/agents/legacy-module-refactor.md`) e perguntar.
2. Ler o README do módulo, sobretudo «Decisões de design» — não desfazer escolhas deliberadas. Se tocar num conceito partilhado, ver `CONTEXT.md` e `docs/adr/`.
3. Identificar se a alteração toca domínio, portas ou adapters.

## Depois de alterar um módulo
1. Correr os testes do módulo e garantir que passam antes de dar a tarefa por concluída (se um hook não correu, usar o comando de «Como testar» do README); `npm run test:unit` para a suíte unitária.
2. Atualizar o README do módulo se mudaram portas, adapters ou um conceito/decisão **local** ao módulo — documentação desatualizada é pior do que nenhuma. Conceito usado por vários módulos, ou decisão arquitetural (difícil de reverter, que surpreenderia um leitor futuro, ou fruto de um trade-off real) → `CONTEXT.md` / `docs/adr/` em vez do README (`docs/agents/domain.md`).
3. Lógica nova de domínio/caso de uso traz teste unitário com fakes; adapters novos trazem teste de integração quando aplicável.
4. Rotas novas: classificar em `src/modules/access/domain/route-permissions.ts` e correr `npm run authz:matrix` (0 não classificadas).

## Testes
Jest. Domínio e casos de uso: rápidos, isolados, com fakes das portas de saída — sem BD nem rede. Adapters: testes de integração separados (`*.integration.test.ts`, precisam da stack Supabase local; não há Docker nesta máquina). Dados de teste sempre fictícios.

## Base de dados e migrações
- Migração nova em `supabase/migrations/` (idempotente) **com rollback** em `docs/migrations/rollback/`; tabela nova registada em `src/infra/scoped-db/table-registry.ts`, com `org_id` e RLS `org_id = current_org()`.
- Queries só pelo scoped helper (`createScopedQuery`), sempre com organização.
- Validar antes de produção (cadeia completa, reexecução, rollback) — ver `docs/01_ARQUITETURA.md`.

## Segurança e permissões
- Todas as rotas `/api/*` são fail-closed na matriz de permissões; autorização por perfil (READ/MANAGE), âmbitos e privacidade por campo.
- Nunca escrever credenciais, chaves ou tokens em código, docs ou chat; só variáveis de ambiente (Render / `.env` local).
- Dados pessoais (RGPD): minimizar; nunca usar dados reais em testes ou documentação.

## Processo (definido pelo utilizador)
- **Merge, migrações e deploy em produção só com aprovação explícita, de cada vez.** Push só quando pedido. Commits só nos ramos/tarefas em que o utilizador os autorizou; nunca descartar, sobrepor, fazer stash ou reset de alterações por commitar sem pedir.
- Tasks por fases: uma fase de cada vez; no fim, relatório (alterações, migrações, testes, riscos, como validar) e esperar autorização para a seguinte.
- Deploy: PR → merge em `main` → Render aplica migrações no preDeploy (`supabase db push`); confirmar `GET /api/health`; backend antes do frontend.
- Respostas e documentação em português de Portugal.

## Documentação de módulo
Cada módulo tem `README.md` com o template fixo (`docs/agents/module-readme-template.md`) e um resumo em `docs/modulos/<modulo>.md` (estado, caminhos, pendências — sem duplicar o README).

## Skills de agente
- Issue tracker: specs e issues em `.scratch/<feature-slug>/` (`docs/agents/issue-tracker.md`).
- Domínio: contexto único `CONTEXT.md` + `docs/adr/` (`docs/agents/domain.md`).
