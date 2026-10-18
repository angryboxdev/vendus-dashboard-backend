# Estado atual

Atualizado: 2026-10-18 (verificado contra o repositório e os ramos). Detalhe por módulo em `docs/modulos/`.

## Em produção (`origin/main` = `8acd9f3`; frontend `4d83bbd`)
- Todos os 51 módulos de `src/modules` (exceto `tasks`, módulo de referência não montado) + camada legada.
- **Novo RH** fases 0–9 (2026-10-12), organização de demonstração, dashboard executivo, Google reviews, Assistente Mezza (OpenAI ou Gemini por variável de ambiente).
- **Financeiro/Stock v1.2 — F1** (2026-10-14, PRs #79/#49): identidade fiscal partilhada, motor único de valores, uma obrigação por documento, versão/auditoria/idempotência nas faturas. Migrações `20261030110000`→`20261030160000` aplicadas (verificado pelo esquema).

## Em desenvolvimento — F2 da task Financeiro/Stock v1.2
Task completa: `.scratch/financeiro-stock-v1-2/task-mestre-v1.2.md` (F1–F4, uma fase de cada vez). Nota de passagem: `.scratch/financeiro-stock-v1-2/F2-estado.md`.

**Backend — ramo `financeiro`, 8 commits locais à frente de `origin/financeiro` (não enviados, não integrados):**
- §2.1 ficha do fornecedor (modo preferido, destino habitual, «Decidir no documento», exceções por loja) e sugestão/validação «Enviar para Stock».
- §2.2 modos «Única | Por artigo | Por valores», repartições, «Guardar rascunho», reabrir rascunho com valores gravados.
- §2.3 `GET /api/invoices/payables-summary` (Total a pagar | Em atraso).
- Migrações novas (não aplicadas): `20261031100000_supplier_routing_preferences`, `20261031110000_invoice_financial_modes` — validadas em PGlite.
- Testes unitários a passar (≈3140), `lint:deps` limpo, matriz 758 rotas / 0 não classificadas. `docs/matriz-autorizacao.md` tem uma alteração por commitar (regenerada).

**Frontend — ramo `financeiro`, alterações por commitar** (lista exata, caminhos e linhas onde continuar: [04_FRONTEND.md](04_FRONTEND.md); o único commit «à frente» do upstream é o merge `4d83bbd`, já em `origin/main`):
- Feito: tipos/clientes HTTP da F2; `SupplierDrawer` (novos campos) + `SupplierLocationRulesPanel`; serviço `allocations-draft.ts` (+6 testes).
- Por fazer: revisão de fatura (seletor de 3 modos, editor «Por valores» com «Por distribuir»/«Propor a partir das linhas», linhas sempre enviadas, remover seletor «Tipo», checkbox «Enviar para Stock» com motivo, «Guardar rascunho»); reabrir rascunho em `InvoicesView` (`handleRowReview` usa `extractedLines: []`); barra «Total a pagar | Em atraso» na lista de Faturas; repartições na vista de Centros de Custo; testes, typecheck (`tsc -p tsconfig.app.json`), build, READMEs.

## Última tarefa concluída
Backend da F2 (commit `2c4bffc`, detalhe devolve `storedAmounts`).

## Próxima tarefa
Concluir o frontend da F2 → testar/validar → relatório da F2 → aguardar autorização do utilizador para push/PR/merge/deploy e para iniciar a F3.

## Alterações por guardar (2026-10-18) — não descartar
- Backend `financeiro`: 8 commits locais não enviados; por commitar: `CLAUDE.md`, `docs/matriz-autorizacao.md` (regenerada), `docs/0*.md`, `docs/modulos/` (consolidação de contexto).
- Frontend `financeiro`: 7 ficheiros modificados + 3 novos da F2 (ver 04_FRONTEND.md) + `docs/ESTADO_ATUAL.md` (ponteiro).
- Nada disto está no GitHub: só existe nesta máquina. Trocar de ramo leva as alterações por commitar consigo (não as perde), mas `reset`/`checkout -- .`/`stash` sem cuidado ou outra máquina perdê-las-iam.

## Pendências operacionais (produção)
- Correr `POST /api/fiscal-documents/backfill` com `{ "dryRun": true }` e rever (precisa de sessão de gestor).
- `GET /api/invoices/integrity/payable-duplicates`: se houver duplicados históricos, o índice único de contas a pagar não foi criado — limpar e reexecutar a migração `20261030130000`.
- Novo RH: decisões humanas D0–D12 (`docs/relatorios/novo-rh-resumo-final.md`); MFA TOTP do Supabase tem de estar ativo.

## Problemas conhecidos (transversais)
- Relatório de IVA (accounting) não inclui IVA de compras de faturas sem linhas «Por artigo» (lacuna anterior).
- Edição de faturas já lançadas não passa pelo motor de valores; frontend não envia `Idempotency-Key`.
- Ramo local `assistente-guardrails` (`002fe99`): WIP que não compila; migração `20261030100000_novo_rh_ai_usage_daily` não aplicada — adiado.
- `main` local está 9 commits atrás de `origin/main` (atualizar antes de criar ramos).

## Por verificar
- Se o índice `payable_entries_one_active_per_invoice` existe em produção.
- Comportamento real da extração por IA com o prompt novo (descontos, quadro de IVA) em faturas reais.
- Ecrãs novos da F1/F2 não foram revistos visualmente no browser.
