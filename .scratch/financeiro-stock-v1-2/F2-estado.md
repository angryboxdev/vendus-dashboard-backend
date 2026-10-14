# F2 — estado para continuar (passagem de sessão, 2026-10-14)

Task completa: `task-mestre-v1.2.md` (nesta pasta). F1 em produção (PRs #79 backend / #49 frontend, migrações 20261030110000→160000 aplicadas).
Regras do utilizador: uma fase de cada vez; seguir opções recomendadas até ao fim da fase sem perguntar; testar e validar;
apresentar resultados e **aguardar autorização antes da F3**; merge/migração/deploy só com aprovação explícita.

Ramo `financeiro` (backend e frontend), commits locais, não enviados.

## Feito
- 2.1 dados (backend `3bb4abf`): ficha do fornecedor com modo financeiro preferido, destino habitual (loja),
  tipo financeiro editável, política `decide_per_document`, exceções por loja (`supplier_location_rules`),
  validação CC/loja no servidor. Migração `20261031100000_supplier_routing_preferences` + rollback.
- 2.1 encaminhamento (backend, commit seguinte): sugestão «Enviar para Stock»
  (`stock-purchase-review/domain/services/stock-routing-suggestion.service.ts`, prioridade loja → fornecedor → categoria → sem sinal),
  `POST /api/invoices/stock-routing-suggestion`, `resolveStockRouting` em criar/confirmar
  (Decidir sem escolha → 422 `stock_decision_required`; desmarcar contra predefinição sem motivo → 422 `stock_reason_required`).

## Decisões de modelo (F2 §2.2), ainda por implementar
- Linhas reais guardadas nos três modos; `invoices.line_detail_mode` ganha `by_values` (simple=Única, detailed=Por artigo).
- `ListInvoiceLinesUseCase` (feed de análise: IVA da Contabilidade + Centros de Custo) passa a devolver só linhas de faturas `detailed`
  → relatórios não mudam retroativamente. Lacuna anterior registada: IVA de compras de faturas simples não entra no relatório de IVA.
- Tabela nova `invoice_allocations` (Por valores): descrição, grupo/subcategoria, loja, montante líquido. Soma = base líquida (motor F1); «Por distribuir».
- Mudar de modo deixa de apagar linhas. Confirmar com `lines` substitui as linhas guardadas do rascunho (não junta).
- «Guardar rascunho» (endpoint novo) sem obrigação nem revisão de Stock. Remover seletor «Tipo» do editor de artigo (manter dados).
- Classificação/Centros de Custo: incluir alocações Por valores (feed próprio).

## Por fazer
1. Testes da sugestão de Stock (escritos: `stock-purchase-review/__tests__/domain/stock-routing-suggestion.service.test.ts`,
   `__tests__/use-cases/suggest-stock-routing.test.ts`) — correr; acrescentar teste de `resolveStockRouting` em criar/confirmar.
2. §2.2 modos financeiros (backend + frontend), incl. exemplo 100+250+300 = 650 € (649/651 bloqueiam).
3. §2.3 resumo «Total a pagar | Em atraso» na barra de filtros (backend agrega saldo aberto: total − alocações bancárias
   `bank_movement_entity_links`; pagas sem alocação = 0; NC aplicadas uma vez; atraso = vencimento < hoje no fuso `organizations.timezone`).
4. Frontend 2.1: SupplierDrawer (novos campos + exceções por loja) e checkbox «Enviar para Stock» com motivo.
5. Validar migrações F2 em PGlite (script modelo: cadeia completa + rollback), testes, lint:deps, authz:matrix, READMEs, relatório da F2.
