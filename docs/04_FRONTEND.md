# Frontend — arquitetura e onde continuar

Repositório separado: `C:\Users\Bruno Fontes\vendus-dashboard-frontend` (React + Vite + TypeScript, TanStack Query, Tailwind, Vitest). Regras próprias no seu `CLAUDE.md` (lista dos módulos já no padrão novo; módulo de referência `src/modules/tasks`). Deploy: Vercel em cada merge para `main`.

## Comunicação com o backend
- `src/lib/api.ts`: base `VITE_API_BASE_URL`/`VITE_API_URL`, `Authorization: Bearer <sessão Supabase>`, helpers `apiGet/apiPost/apiPut/apiPatch/apiDelete*`, `ApiError` (`status`, `data` com `code` do backend).
- Cada módulo: `domain/` (tipos e serviços puros, sem React), `domain/ports/out/*-api.port.ts` (contrato), `adapters/out/http-*-api.adapter.ts` (chamadas a `/api/...`), `adapters/in/*.tsx` (UI), `<modulo>.module.tsx` (Provider/Context que injeta o adapter; hook `use<Modulo>Module()`).
- Tipos espelham os DTOs do backend (ex.: `src/modules/invoices/domain/entities/invoice.ts` ↔ `src/modules/invoices/domain/ports/in/invoice.ports.ts` no backend).
- Motor de valores espelhado do backend em `src/modules/invoices/domain/services/` (`decimal.ts`, `document-amounts.ts`, `invoice-amounts.service.ts`, `draft-amounts.ts`) — mesmos vetores de teste; alterar os dois lados juntos.
- Verificação: `npx tsc -p tsconfig.app.json --noEmit` (o `-p .` não verifica nada), `npx vitest run`, `npm run build`.

## Caminhos relevantes para Financeiro/Stock
| Área | Ficheiros |
|---|---|
| Faturas (lista, detalhe, filtros) | `src/modules/invoices/adapters/in/InvoicesView.tsx` |
| Revisão de importação / edição completa | `src/modules/invoices/adapters/in/ReviewImportedInvoiceDrawer.tsx` (contém `AmountsSummary`, testado em `AmountsSummary.test.tsx`) |
| Importar fatura | `src/modules/invoices/adapters/in/ImportInvoiceModal.tsx` |
| Fornecedores | `src/modules/financial-base/adapters/in/SupplierDrawer.tsx`, `SupplierLocationRulesPanel.tsx` |
| Centros de custo (análise) | `src/modules/financial-base/adapters/in/CostCentersView.tsx` (`Tab3Aplicacao` usa `GET /api/invoices/lines`) |
| Importação no Stock (legado) | `src/pages/stock/invoiceImport/` |
| Compras por rever / contagens | `src/modules/stock-purchase-review/`, `src/modules/stock-count/` |
| Lojas | `src/components/LocationSelect.tsx`, `src/modules/locations/adapters/in/use-locations.ts` |

## F2 — estado exato no frontend (ramo `financeiro`)
**Feito (compila; testes a passar; commit `59a5213`):**
- Tipos e clientes HTTP: `supplier.ts`, `financial-base-api.port.ts`, `http-financial-base-api.adapter.ts`, `invoice.ts`, `invoices-api.port.ts`, `http-invoices-api.adapter.ts` (`getStockRoutingSuggestion`, `saveInvoiceDraft`, `replaceInvoiceAllocations`, `listInvoiceAllocations`, `getPayablesSummary`; tipos `FinancialModeName`, `AllocationPayload`, `PayablesSummaryDTO`, `SaveDraftResultDTO`, `StockRoutingSuggestion`).
- `SupplierDrawer.tsx`: «Enviar para Stock» (4 políticas), modo financeiro preferido, destino habitual; `SupplierLocationRulesPanel.tsx` (exceções por loja, só com >1 loja ativa).
- `src/modules/invoices/domain/services/allocations-draft.ts` (+ `.test.ts`, 6 testes): «Por distribuir», validação, payload, «Propor a partir das linhas», deteção de mistura.

**Feito, por commitar (2026-10-18) — passo 1, revisão de fatura:**
- `ReviewImportedInvoiceDrawer.tsx`: seletor «Única | Por artigo | Por valores» (modo gravado → preferência do fornecedor); linhas sempre enviadas + `financialMode` + `allocations`; pré-visualização com linhas em qualquer modo; seletor «Tipo» removido; «Guardar rascunho» (atualiza `version` local); edição «Por valores» (passagem por «Por artigo» → `updateInvoice` → linhas → «Por valores» → `replaceInvoiceAllocations`).
- Novos: `AllocationsEditor.tsx`, `SendToStockField.tsx`, `CostCenterCascadeSelect.tsx` (extraído), `domain/services/stock-decision.ts`; testes `stock-decision.test.ts`, `AllocationsEditor.test.tsx`, `SendToStockField.test.tsx`. README de `invoices` atualizado.

**Falta (por esta ordem):**
1. ~~`ReviewImportedInvoiceDrawer.tsx`~~ (feito, acima).
2. `InvoicesView.tsx`: `handleRowReview` (≈ linha 3263) deve preencher linhas/repartições/`storedAmounts` do detalhe (hoje `extractedLines: []`); «Total a pagar | Em atraso» na barra de filtros (≈ linha 3554), sem cards, com `getPayablesSummary` (pesquisa, mês, fornecedor); texto do modal de troca de modo (já não apaga linhas).
3. `CostCentersView.tsx` (`Tab3Aplicacao`): somar `listInvoiceAllocations()` às linhas.
4. Testes de UI das peças novas, typecheck, build, README de `invoices` e `financial-base` do frontend.
