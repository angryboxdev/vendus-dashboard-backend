import { ALL_PERMISSION_KEYS } from "../../domain/catalog.js";
import { classifyRoute, ROUTE_RULES } from "../../domain/route-permissions.js";

const key = (method: string, path: string) => {
  const d = classifyRoute(method, path);
  if (!d.target) return null;
  return d.target.kind === "permission" ? `${d.target.key}:${d.level}` : d.target.kind;
};

describe("Tabela rota → permissão", () => {
  it("todas as regras apontam para chaves do catálogo", () => {
    for (const r of ROUTE_RULES) if (r.target.kind === "permission") expect(ALL_PERMISSION_KEYS).toContain(r.target.key);
  });

  it.each([
    // Vendas / DRE
    ["GET", "/api/vendus/summary", "sales.dashboard:READ"],
    ["GET", "/api/analytics/current", "sales.dashboard:READ"],
    ["GET", "/api/documents/123", "sales.dashboard:READ"],
    ["POST", "/api/sales-summary/refresh", "sales.results:MANAGE"],
    ["POST", "/api/sales-declaration/export", "sales.dashboard:READ"],
    ["PATCH", "/api/cash-closings/abc", "sales.cash_closings:MANAGE"],
    ["POST", "/api/air-menu/webhook/register", "sales.air_menu:MANAGE"],
    ["GET", "/api/reports/dre/kpis", "dre.statement:READ"],
    ["DELETE", "/api/reports/dre/custos-fixos/1", "dre.fixed_costs:MANAGE"],
    // Financeiro
    ["GET", "/api/financial-base/suppliers/1/statement-pdf", "finance.suppliers:READ"],
    ["POST", "/api/financial-base/cost-centers/seed", "finance.cost_centers:MANAGE"],
    ["PATCH", "/api/invoices/1/lines/2/classify", "finance.invoices:MANAGE"],
    ["GET", "/api/payable-entries/calendar", "finance.payables:READ"],
    ["POST", "/api/payable-recurrences/batch/generate", "finance.recurrences:MANAGE"],
    ["PATCH", "/api/bank-statements/movements/9/reconcile", "finance.banking:MANAGE"],
    ["GET", "/api/bank-accounts/banks", "finance.banking:READ"],
    ["PATCH", "/api/accounting/settings", "finance.accounting:MANAGE"],
    // Stock
    ["GET", "/api/stock/items/5/movements", "stock.movements:READ"],
    ["PUT", "/api/stock/items/5", "stock.items:MANAGE"],
    ["POST", "/api/stock/invoice-imports/1/confirm", "stock.invoice_imports:MANAGE"],
    ["GET", "/api/reports/ingredient-consumption", "stock.movements:READ"],
    ["POST", "/api/stock-purchase-reviews/1/confirm", "stock.purchase_reviews:MANAGE"],
    ["POST", "/api/stock-count/sessions/1/confirm", "stock.count_confirm:MANAGE"],
    ["POST", "/api/stock-count/lines/1/attempts", "stock.counts:MANAGE"],
    ["POST", "/api/stock-planning/run-forecast", "stock.forecast_ops:MANAGE"],
    ["GET", "/api/stock-planning/alerts", "stock.planning:READ"],
    ["DELETE", "/api/pizzas/1/recipes/2/items/3", "stock.recipes:MANAGE"],
    ["GET", "/api/preparations", "stock.recipes:READ"],
    // CRM
    ["PATCH", "/api/crm/scripts/x", "crm.settings:MANAGE"],
    ["POST", "/api/crm/contacts", "crm.contacts:MANAGE"],
    ["GET", "/api/crm/customer-table", "crm.customers:READ"],
    // RH
    ["GET", "/api/hr/overview/shifts-to-review", "hr.overview:READ"],
    ["POST", "/api/hr/attendance/closure/reopen", "hr.reopen_month:MANAGE"],
    ["POST", "/api/hr/attendance/closure/close", "hr.closure:MANAGE"],
    ["GET", "/api/hr/attendance/issues", "hr.attendance:READ"],
    ["PATCH", "/api/hr/shifts/1/attendance", "hr.attendance:MANAGE"],
    ["POST", "/api/hr/schedules/work-shifts/clear", "hr.schedules:MANAGE"],
    ["PATCH", "/api/hr/shifts/1", "hr.schedules:MANAGE"],
    ["POST", "/api/hr/payslips/import", "hr.payslip_import:MANAGE"],
    ["GET", "/api/hr/people/1/documents/2/download-url", "hr.documents:READ"],
    ["GET", "/api/hr/document-overview", "hr.documents:READ"],
    ["GET", "/api/hr/audit-logs", "hr.history:READ"],
    ["GET", "/api/hr/leave/holidays", "hr.leave:READ"],
    ["POST", "/api/hr/leave/holidays", "company.holidays:MANAGE"],
    ["PATCH", "/api/hr/employees/1/leave/balance/2026", "hr.leave:MANAGE"],
    ["GET", "/api/hr/employees/1/payments", "hr.payments:READ"],
    ["PATCH", "/api/hr/payments/1", "hr.payments:MANAGE"],
    ["GET", "/api/hr/people/1", "hr.employees:READ"],
    ["POST", "/api/hr/people/1/portal-access", "hr.employees:MANAGE"],
    ["GET", "/api/hr/employees/expiring-contracts", "hr.employees:READ"],
    // Empresa & Estrutura
    ["GET", "/api/organization", "base"],
    ["PATCH", "/api/organization", "company.organization:MANAGE"],
    ["GET", "/api/organization/history", "company.organization:MANAGE"],
    ["GET", "/api/locations", "base"],
    ["PATCH", "/api/locations/1/geofence", "company.locations:MANAGE"],
    ["GET", "/api/locations/1/history", "company.locations:MANAGE"],
    ["GET", "/api/hr/document-categories", "base"],
    ["POST", "/api/document-categories", "company.documents:MANAGE"],
    ["GET", "/api/company-documents/1/download-url", "company.documents:READ"],
    ["GET", "/api/calendar/upcoming", "base"],
    ["POST", "/api/calendar/events", "company.calendar:MANAGE"],
    ["POST", "/api/calendar/holidays/import", "company.holidays:MANAGE"],
    ["POST", "/api/location-credentials/pairing-codes", "company.devices:MANAGE"],
    ["PATCH", "/api/hr/positions/1/active", "company.positions:MANAGE"],
    // Portal / Admin
    ["GET", "/api/me", "portal"],
    ["POST", "/api/me/punches", "portal"],
    ["GET", "/api/me/access", "portal"],
    ["POST", "/api/auth/users", "admin"],
  ])("%s %s → %s", (method, path, expected) => {
    expect(key(method, path)).toBe(expected);
  });

  it("rota não classificada é recusada (falha fechada)", () => {
    expect(classifyRoute("GET", "/api/rota-nova").target).toBeNull();
    expect(classifyRoute("GET", "/api/meetings").target).toBeNull();
  });
});
