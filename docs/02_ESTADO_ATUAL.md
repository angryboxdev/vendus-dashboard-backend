# Estado atual

Atualizado: 2026-10-18 (verificado contra o repositório, os ramos e a produção). Detalhe por módulo em `docs/modulos/`.

## Em produção (`origin/main` backend = `f770aa4`; frontend = `6fdbd05`)
- Todos os 51 módulos de `src/modules` (exceto `tasks`, módulo de referência não montado) + camada legada.
- **Novo RH** fases 0–9 (2026-10-12), organização de demonstração, dashboard executivo, Google reviews, Assistente Mezza (OpenAI ou Gemini por variável de ambiente).
- **Financeiro/Stock v1.2 — F1** (2026-10-14, PRs #79/#49): identidade fiscal partilhada, motor único de valores, uma obrigação por documento, versão/auditoria/idempotência nas faturas. Migrações `20261030110000`→`20261030160000` aplicadas.
- **Financeiro/Stock v1.2 — F2** (2026-10-18, PRs #80/#50): ficha do fornecedor (modo preferido, destino habitual, «Decidir no documento», exceções por loja) e «Enviar para Stock»; modos «Única | Por artigo | Por valores», repartições, «Guardar rascunho», reabrir rascunho; «Total a pagar | Em atraso»; Centros de Custo com repartições (pelo líquido). Migrações `20261031100000_supplier_routing_preferences` e `20261031110000_invoice_financial_modes` aplicadas pelo Render (verificado: `suppliers.default_location_id`, `invoice_allocations`, `supplier_location_rules` existem; `GET /api/health` = `f770aa4`).

## Em desenvolvimento
Nada em curso. Task Financeiro/Stock v1.2: `.scratch/financeiro-stock-v1-2/task-mestre-v1.2.md` — **F3** (Stock: linhas reais, fila útil e importação) e **F4** (calendário de fornecedores e aprendizagem controlada) por fazer.

## Última tarefa concluída
F2 em produção (backend e frontend), 2026-10-18.

## Próxima tarefa
1. Validar a F2 no browser em produção (checklist: três modos sem perda; «Por valores» 100+250+300 = 650 € fecha, 649/651 bloqueiam; guardar rascunho → reabrir pela lista → lançar; «Decidir no documento» e desmarcar «Enviar para Stock» com motivo; «Total a pagar | Em atraso» com filtros; Centros de Custo → Aplicação em Faturas).
2. Pendências operacionais da F1 (abaixo).
3. Com autorização do utilizador: iniciar a F3.

## Pendências operacionais (produção)
- Correr `POST /api/fiscal-documents/backfill` com `{ "dryRun": true }` e rever (precisa de sessão de gestor).
- `GET /api/invoices/integrity/payable-duplicates`: se houver duplicados históricos, o índice único de contas a pagar não foi criado — limpar e reexecutar a migração `20261030130000`.
- Novo RH: decisões humanas D0–D12 (`docs/relatorios/novo-rh-resumo-final.md`); MFA TOTP do Supabase tem de estar ativo.

## Problemas conhecidos (transversais)
- **Ambiente local usa o Supabase de produção** (`.env` do backend e do frontend): testes locais escrevem em dados reais e dependem das migrações de produção. Recomendado: projeto Supabase de desenvolvimento.
- Relatório de IVA (accounting) e Centros de Custo não incluem faturas «Única» (lacuna anterior).
- Edição de uma fatura «Por valores» no frontend são vários pedidos (não atómico); candidato: `allocations` no `PATCH /invoices/:id`.
- Edição de faturas já lançadas não passa pelo motor de valores; frontend não envia `Idempotency-Key`.
- Ramo local `assistente-guardrails` (`002fe99`): WIP que não compila; migração `20261030100000_novo_rh_ai_usage_daily` não aplicada — adiado.
- `main` local desatualizado em relação a `origin/main` (atualizar antes de criar ramos).

## Por verificar
- Se o índice `payable_entries_one_active_per_invoice` existe em produção.
- Comportamento real da extração por IA com o prompt novo (descontos, quadro de IVA) em faturas reais.
- Ecrãs da F1/F2 não foram revistos visualmente no browser.
