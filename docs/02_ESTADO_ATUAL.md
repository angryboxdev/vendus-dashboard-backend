# Estado atual

Atualizado: 2026-10-18 (verificado contra o repositório e os ramos). Detalhe por módulo em `docs/modulos/`.

## Em produção (`origin/main` = `8acd9f3`; frontend `4d83bbd`)
- Todos os 51 módulos de `src/modules` (exceto `tasks`, módulo de referência não montado) + camada legada.
- **Novo RH** fases 0–9 (2026-10-12), organização de demonstração, dashboard executivo, Google reviews, Assistente Mezza (OpenAI ou Gemini por variável de ambiente).
- **Financeiro/Stock v1.2 — F1** (2026-10-14, PRs #79/#49): identidade fiscal partilhada, motor único de valores, uma obrigação por documento, versão/auditoria/idempotência nas faturas. Migrações `20261030110000`→`20261030160000` aplicadas (verificado pelo esquema).

## Em desenvolvimento — F2 da task Financeiro/Stock v1.2
Task completa: `.scratch/financeiro-stock-v1-2/task-mestre-v1.2.md` (F1–F4, uma fase de cada vez). Nota de passagem: `.scratch/financeiro-stock-v1-2/F2-estado.md`.

**Backend — ramo `financeiro` (enviado para `origin/financeiro`; não integrado em `main`):**
- §2.1 ficha do fornecedor (modo preferido, destino habitual, «Decidir no documento», exceções por loja) e sugestão/validação «Enviar para Stock».
- §2.2 modos «Única | Por artigo | Por valores», repartições, «Guardar rascunho», reabrir rascunho com valores gravados.
- §2.3 `GET /api/invoices/payables-summary` (Total a pagar | Em atraso).
- Migrações novas (não aplicadas): `20261031100000_supplier_routing_preferences`, `20261031110000_invoice_financial_modes` — validadas em PGlite.
- Testes unitários a passar (≈3140), `lint:deps` limpo, matriz 758 rotas / 0 não classificadas.

**Frontend — ramo `financeiro`** (detalhe e onde continuar: [04_FRONTEND.md](04_FRONTEND.md)):
- Commitado e enviado (`59a5213`): tipos/clientes HTTP da F2; `SupplierDrawer` + `SupplierLocationRulesPanel`; `allocations-draft.ts`.
- Commitado (`bb400e7`, não enviado): passo 1 — revisão de fatura (3 modos, `AllocationsEditor`, linhas sempre enviadas, sem seletor «Tipo», `SendToStockField`, «Guardar rascunho», edição «Por valores»).
- Feito, **por commitar** (2026-10-18): passo 2 — `InvoicesView` (reabrir rascunho com linhas/repartições/`storedAmounts`, `PayablesSummaryBar` «Total a pagar | Em atraso», detalhe sem apagar linhas ao mudar para «Única» e repartições «Por valores» no separador Linhas). Typecheck, 619 testes e build a passar.
- Por fazer: passos 3–4 de 04_FRONTEND (`CostCentersView`, README de `financial-base`, relatório da F2).

## Última tarefa concluída
Frontend F2 · passo 2 — `InvoicesView` (2026-10-18), por commitar.

## Próxima tarefa
Frontend F2 · passo 3 (`CostCentersView` → `Tab3Aplicacao` soma `listInvoiceAllocations()` às linhas) → passo 4 → relatório da F2 → aguardar autorização para push/PR/merge/deploy, aplicação das migrações F2 e início da F3.

## Alterações por guardar (2026-10-18) — não descartar
- Frontend `financeiro`: passo 2 por commitar; `bb400e7` (passo 1) commitado mas não enviado. Só existe nesta máquina.
- Backend `financeiro`: `fb0ce97` (docs) não enviado; esta atualização de `docs/` por commitar.

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
