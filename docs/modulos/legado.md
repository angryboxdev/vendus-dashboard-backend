# Camada legada (fora de `src/modules`)

**Estado:** em produção, **legado** — não imitar (ver `docs/agents/project-status.md`). Alterações mínimas; migração para o padrão hexagonal só com autorização (`docs/agents/legacy-module-refactor.md`).

## O que existe
Routers em `src/routes/*Routes.ts` (montados em `src/server.ts`) chamam serviços em `src/services/*Service.ts`, que acedem diretamente à BD.

| Área | Routers | Serviços principais | Docs existentes |
|---|---|---|---|
| Stock (artigos, categorias, movimentos, ajustes, preparações) | `stockRoutes`, `preparationRoutes` | `stockItemService`, `stockMovementService`, `stockCategoryService`, `stockAdjustmentFromLinesService`, `preparationService`, `consumableConsumptionService`, `ingredientConsumptionService` | `docs/STOCK_PRICING.md`, `docs/STOCK_ADJUSTMENT_FROM_LINES.md`, `docs/CRON_DAILY_STOCK.md` |
| Importação de faturas no Stock | `supplierInvoiceImportRoutes` | `supplierInvoiceImportService`, `openaiInvoiceExtractService` | `docs/SUPPLIER_INVOICE_IMPORT.md` |
| Pizzas / receitas / preços | `pizzaRoutes` | `pizzaService`, `pizzaRecipeService`, `pizzaRecipeItemService`, `pizzaPriceService`, `vendusMappingService` | `docs/API_PIZZAS_FRONTEND.md`, `docs/VENDUS_PIZZA_MAPPING_FORMAT.md` |
| DRE / analytics / relatórios / resumo mensal | `dreRoutes`, `analyticsRoutes`, `reportsRoutes` | `dre*Service`, `analyticsDashboardService`, `monthlySummaryService` | `docs/API_PAINEL_FRONTEND*.md`, `docs/FINANCIAL_SYSTEM_PLAN.md` |
| RH antigo (colaboradores, turnos, kiosk, férias, auditoria, pagamentos) | `hrRoutes`, `hrKioskRoutes`, `hrLeaveRoutes`, `hrAuditRoutes` | `hrEmployeeService`, `hrShiftService`, `hrShiftAttendanceService`, `hrKioskService`, `hrLeaveService`, `hrPaymentService`, `hrDocumentService` | READMEs do módulo [hr](hr.md) |
| CRM (legado; módulo `crm` em refactor) | `crmRoutes` | `crm*Service` | `docs/crm-*.md` |
| Documentos, autenticação admin | `documentsRoutes`, `authRoutes` | `documentsService` | — |
| Cron interno | `internalCronRoutes` | `dailyVendusConsumptionJobService`, jobs em `src/jobs/` | `docs/CRON_DAILY_STOCK.md` |
| Provisionamento de organizações | — | `organizationProvisioningService` (`npm run org:provision`) | `docs/DEPLOY_TENANT_IDENTITY.md` |

## Regras/alterações recentes relevantes
- **Importação no Stock** (F1 v1.2): guarda `supplier_nif`; confirmar exige NIF + número e reserva a identidade fiscal ([fiscal-documents](fiscal-documents.md)). Já existe no Financeiro / possível duplicado → 409; identidade incompleta → 422. **Substituir uma importação confirmada (`override_duplicate`) deixou de ser possível** (apagava movimentos); corrige-se por ajuste.
- Todas as rotas `/api/*` passam pela matriz de permissões fail-closed (`src/modules/access/domain/route-permissions.ts`).

## Próximos trabalhos
- F3 da task Financeiro/Stock v1.2 (linhas reais, fila, importação no Stock com pendência financeira) — ver [stock-purchase-review](stock-purchase-review.md).
