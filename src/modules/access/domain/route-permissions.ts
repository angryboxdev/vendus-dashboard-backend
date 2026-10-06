import type { AccessLevel } from "./catalog.js";

/**
 * Tabela central rota → permissão (Utilizadores & Perfis de Acesso 2.0,
 * ticket 04). Avaliada por ordem; a primeira regra que casa decide. Rota de
 * `/api` sem regra → RECUSADA (falha fechada — uma rota nova tem de ser
 * classificada aqui). Nível: GET = READ, restantes métodos = MANAGE, salvo
 * `level` explícito.
 *
 * `BASE`: leituras de apoio que qualquer utilizador da área de gestão
 * precisa (seletores de Locais, perfil da Empresa, categorias, calendário
 * filtrado). `ADMIN`: exclusivo do Admin (Utilizadores & Perfis).
 * As rotas públicas/dispositivos/cron estão montadas antes da autenticação
 * e nunca chegam aqui.
 */
export type RouteTarget = { kind: "permission"; key: string; level?: Exclude<AccessLevel, "NONE"> } | { kind: "base" } | { kind: "admin" } | { kind: "portal" };

interface RouteRule {
  pattern: RegExp;
  /** Só para estes métodos (omitido = todos). */
  methods?: string[];
  target: RouteTarget;
}

const p = (key: string, level?: Exclude<AccessLevel, "NONE">): RouteTarget => ({ kind: "permission", key, ...(level && { level }) });
const GET = ["GET"];
const ID = "[^/]+";

export const ROUTE_RULES: RouteRule[] = [
  // Portal do Colaborador e acesso próprio — protegidos pelos seus routers.
  { pattern: /^\/api\/me(\/|$)/, target: { kind: "portal" } },
  // Utilizadores & Perfis
  { pattern: /^\/api\/(auth|users|access-profiles)(\/|$)/, target: { kind: "admin" } },

  // ── Empresa & Estrutura ──────────────────────────────────────────────
  { pattern: /^\/api\/organization\/history$/, target: p("company.organization", "MANAGE") },
  { pattern: /^\/api\/organization$/, methods: GET, target: { kind: "base" } },
  { pattern: /^\/api\/organization(\/|$)/, target: p("company.organization") },
  { pattern: new RegExp(`^/api/locations/${ID}/history$`), target: p("company.locations", "MANAGE") },
  { pattern: /^\/api\/locations$/, methods: GET, target: { kind: "base" } },
  { pattern: /^\/api\/locations(\/|$)/, target: p("company.locations") },
  { pattern: /^\/api\/(hr\/)?document-categories$/, methods: GET, target: { kind: "base" } },
  { pattern: /^\/api\/(hr\/)?document-categories(\/|$)/, target: p("company.documents") },
  { pattern: /^\/api\/company-documents(\/|$)/, target: p("company.documents") },
  { pattern: /^\/api\/calendar\/holidays(\/|$)/, target: p("company.holidays") },
  { pattern: /^\/api\/calendar\/events(\/|$)/, target: p("company.calendar") },
  { pattern: /^\/api\/calendar(\/upcoming)?$/, methods: GET, target: { kind: "base" } },
  { pattern: /^\/api\/location-credentials(\/|$)/, target: p("company.devices") },
  { pattern: /^\/api\/hr\/positions(\/|$)/, target: p("company.positions") },

  // ── Vendas ───────────────────────────────────────────────────────────
  { pattern: /^\/api\/(analytics|vendus|documents)(\/|$)/, target: p("sales.dashboard") },
  { pattern: /^\/api\/reports\/monthly-summary$/, target: p("sales.dashboard") },
  { pattern: /^\/api\/sales-summary(\/|$)/, target: p("sales.results") },
  { pattern: /^\/api\/cash-closings(\/|$)/, target: p("sales.cash_closings") },
  { pattern: /^\/api\/air-menu(\/|$)/, target: p("sales.air_menu") },

  // ── DRE ──────────────────────────────────────────────────────────────
  { pattern: /^\/api\/reports\/dre\/(receita-bruta|kpis)$/, target: p("dre.statement") },
  { pattern: /^\/api\/reports\/dre\/custos-fixos(\/|$)/, target: p("dre.fixed_costs") },
  { pattern: /^\/api\/reports\/dre\/custos-variaveis(\/|$)/, target: p("dre.variable_costs") },

  // ── Financeiro ───────────────────────────────────────────────────────
  { pattern: /^\/api\/financial-base\/suppliers(\/|$)/, target: p("finance.suppliers") },
  { pattern: /^\/api\/financial-base(\/|$)/, target: p("finance.cost_centers") },
  { pattern: /^\/api\/invoices(\/|$)/, target: p("finance.invoices") },
  { pattern: /^\/api\/payable-entries(\/|$)/, target: p("finance.payables") },
  { pattern: /^\/api\/payable-recurrences(\/|$)/, target: p("finance.recurrences") },
  { pattern: /^\/api\/bank-(accounts|statements)(\/|$)/, target: p("finance.banking") },
  { pattern: /^\/api\/accounting(\/|$)/, target: p("finance.accounting") },

  // ── Stock ────────────────────────────────────────────────────────────
  { pattern: /^\/api\/stock\/invoice-imports(\/|$)/, target: p("stock.invoice_imports") },
  { pattern: new RegExp(`^/api/stock/(movements(/|$)|items/${ID}/movements$)`), target: p("stock.movements") },
  { pattern: /^\/api\/reports\/ingredient-consumption$/, target: p("stock.movements") },
  { pattern: /^\/api\/stock\/(categories|items)(\/|$)/, target: p("stock.items") },
  { pattern: /^\/api\/stock-purchase-reviews(\/|$)/, target: p("stock.purchase_reviews") },
  { pattern: new RegExp(`^/api/stock-count/sessions/${ID}/confirm$`), target: p("stock.count_confirm") },
  { pattern: /^\/api\/stock-count(\/|$)/, target: p("stock.counts") },
  { pattern: /^\/api\/stock-planning\/(backfill|run-forecast|detect-deviation)$/, target: p("stock.forecast_ops") },
  { pattern: /^\/api\/stock-planning(\/|$)/, target: p("stock.planning") },
  { pattern: /^\/api\/(pizzas|preparations)(\/|$)/, target: p("stock.recipes") },

  // ── CRM ──────────────────────────────────────────────────────────────
  { pattern: /^\/api\/crm\/contacts(\/|$)/, target: p("crm.contacts") },
  { pattern: /^\/api\/crm\/(scripts|parameters|action-types)(\/|$)/, target: p("crm.settings") },
  { pattern: /^\/api\/crm(\/|$)/, target: p("crm.customers") },

  // ── Recursos Humanos ─────────────────────────────────────────────────
  { pattern: /^\/api\/hr\/overview(\/|$)/, target: p("hr.overview") },
  { pattern: /^\/api\/hr\/attendance\/closure\/reopen$/, target: p("hr.reopen_month") },
  { pattern: /^\/api\/hr\/attendance\/closure(\/|$)/, target: p("hr.closure") },
  { pattern: /^\/api\/hr\/attendance(\/|$)/, target: p("hr.attendance") },
  { pattern: new RegExp(`^/api/hr/shifts/${ID}/attendance$`), target: p("hr.attendance") },
  { pattern: /^\/api\/hr\/(schedules|shifts)(\/|$)/, target: p("hr.schedules") },
  { pattern: /^\/api\/hr\/payslips(\/|$)/, target: p("hr.payslip_import") },
  { pattern: new RegExp(`^/api/hr/(people|employees)/${ID}/documents(/|$)`), target: p("hr.documents") },
  { pattern: /^\/api\/hr\/document-overview$/, target: p("hr.documents") },
  { pattern: /^\/api\/hr\/audit-logs$/, target: p("hr.history") },
  { pattern: /^\/api\/hr\/leave\/holidays(\/|$)/, methods: GET, target: p("hr.leave") },
  { pattern: /^\/api\/hr\/leave\/holidays(\/|$)/, target: p("company.holidays") },
  { pattern: new RegExp(`^/api/hr/(leave(/|$)|employees/${ID}/leave(/|$))`), target: p("hr.leave") },
  { pattern: new RegExp(`^/api/hr/(payments(/|$)|employees/${ID}/payments$)`), target: p("hr.payments") },
  { pattern: /^\/api\/hr\/(people|employees)(\/|$)/, target: p("hr.employees") },
];

export interface RouteDecision {
  target: RouteTarget | null;
  /** Nível exigido quando o alvo é uma permissão. */
  level: Exclude<AccessLevel, "NONE">;
}

/** Classifica um pedido (método + caminho sem query). `target: null` = rota não classificada → recusar. */
export function classifyRoute(method: string, path: string): RouteDecision {
  const m = method.toUpperCase();
  const defaultLevel = m === "GET" || m === "HEAD" ? "READ" : "MANAGE";
  for (const rule of ROUTE_RULES) {
    if (rule.methods && !rule.methods.includes(m)) continue;
    if (!rule.pattern.test(path)) continue;
    const level = rule.target.kind === "permission" && rule.target.level ? rule.target.level : defaultLevel;
    return { target: rule.target, level };
  }
  return { target: null, level: defaultLevel };
}
