import type { AccessLevel } from "./catalog.js";
import { can, type AccessSubject } from "./services/effective-access.service.js";

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
  { pattern: /^\/api\/(hr|novo-rh)\/positions(\/|$)/, target: p("company.positions") },

  // ── Vendas ───────────────────────────────────────────────────────────
  { pattern: /^\/api\/(analytics|vendus|documents)(\/|$)/, target: p("sales.dashboard") },
  { pattern: /^\/api\/reports\/monthly-summary$/, target: p("sales.dashboard") },
  { pattern: /^\/api\/sales-summary(\/|$)/, target: p("sales.results") },
  // Declaração de Vendas (Excel do MBS a partir de SAF-T): gera um ficheiro, não grava nada — basta Ver.
  { pattern: /^\/api\/sales-declaration\/export$/, target: p("sales.dashboard", "READ") },
  { pattern: /^\/api\/cash-closings(\/|$)/, target: p("sales.cash_closings") },
  { pattern: /^\/api\/air-menu(\/|$)/, target: p("sales.air_menu") },

  // ── DRE ──────────────────────────────────────────────────────────────
  { pattern: /^\/api\/reports\/dre\/(receita-bruta|kpis|fluxo-caixa|resultado|conferencia-vendas|parametros|vendas-restaurante)$/, target: p("dre.statement") },
  // «Para tratar» do fluxo de caixa: totais das contas a pagar e faturas por rever — só quem vê Contas a pagar.
  { pattern: /^\/api\/reports\/dre\/fluxo-caixa\/para-tratar$/, target: p("finance.payables") },
  // Pagamentos por trás de cada rubrica da DRE: mostra o descritivo dos movimentos — só quem vê Bancos.
  { pattern: /^\/api\/reports\/dre\/pagamentos$/, target: p("finance.banking", "READ") },
  { pattern: /^\/api\/reports\/dre\/custos-fixos(\/|$)/, target: p("dre.fixed_costs") },
  { pattern: /^\/api\/reports\/dre\/custos-variaveis(\/|$)/, target: p("dre.variable_costs") },

  // ── Financeiro ───────────────────────────────────────────────────────
  { pattern: /^\/api\/financial-base\/suppliers(\/|$)/, target: p("finance.suppliers") },
  { pattern: /^\/api\/financial-base(\/|$)/, target: p("finance.cost_centers") },
  // F3c: importar a fatura diretamente no Stock — permissão de Compras por rever, não do Financeiro.
  { pattern: /^\/api\/invoices\/import-for-stock$/, target: p("stock.purchase_reviews", "MANAGE") },
  // Logótipos dos fornecedores a partir das faturas — grava nos fornecedores, por isso Fornecedores (Gerir).
  { pattern: /^\/api\/invoices\/supplier-logos\/fill$/, target: p("finance.suppliers", "MANAGE") },
  { pattern: /^\/api\/invoices(\/|$)/, target: p("finance.invoices") },
  // Identidade fiscal partilhada: migração do histórico (simulação/execução) — gestão de faturas.
  { pattern: /^\/api\/fiscal-documents\/backfill$/, target: p("finance.invoices", "MANAGE") },
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
  { pattern: /^\/api\/recipe-costing$/, target: p("stock.recipes") },
  // Definições das Fichas técnicas (V7): IVA das vendas para a margem — ler READ, gravar MANAGE.
  { pattern: /^\/api\/recipe-costing\/settings$/, target: p("stock.recipes") },
  // Demonstração do Stock: estado dos cenários e vendas do POS fictício (Admin verificado no módulo).
  { pattern: /^\/api\/stock-demo$/, methods: GET, target: p("stock.items") },
  { pattern: /^\/api\/stock-demo\/pos\/sales$/, methods: GET, target: p("stock.items") },
  { pattern: /^\/api\/stock-demo\/[^/]+(\/reset)?$/, methods: ["POST"], target: p("stock.items", "MANAGE") },
  // Histórico semanal do preço de compra no artigo (V5 §5) — «Artigos e ingredientes».
  { pattern: new RegExp(`^/api/recipe-costing/ingredients/${ID}/price-history$`), methods: GET, target: p("stock.items") },
  // Lista «Artigos e ingredientes» (V6): resumo de custos e fichas que usam o ingrediente.
  { pattern: /^\/api\/recipe-costing\/ingredients\/overview$/, methods: GET, target: p("stock.items") },
  { pattern: new RegExp(`^/api/recipe-costing/ingredients/${ID}/usage$`), methods: GET, target: p("stock.items") },
  // Impacto do preço dos ingredientes nas pizzas (V6 §8) — «Fichas técnicas».
  { pattern: /^\/api\/recipe-costing\/dishes\/impact$/, methods: GET, target: p("stock.recipes") },
  // Custo teórico semanal de uma pizza (V5 §6) — «Fichas técnicas».
  { pattern: new RegExp(`^/api/recipe-costing/dishes/${ID}/weekly$`), methods: GET, target: p("stock.recipes") },

  // ── CRM ──────────────────────────────────────────────────────────────
  { pattern: /^\/api\/crm\/contacts(\/|$)/, target: p("crm.contacts") },
  { pattern: /^\/api\/crm\/(scripts|parameters|action-types)(\/|$)/, target: p("crm.settings") },
  { pattern: /^\/api\/crm(\/|$)/, target: p("crm.customers") },

  // ── Novo RH (task faseada) ───────────────────────────────────────────
  // Pré-visualizar impacto não grava nada, mas só serve a quem vai alterar.
  // Organização de demonstração (ADR-0034): estado/criação; criar exige ainda Admin.
  { pattern: /^\/api\/novo-rh\/demo(\/refresh)?$/, target: p("governance.settings") },
  { pattern: /^\/api\/novo-rh\/settings(\/|$)/, target: p("governance.settings") },
  // Avisos automáticos: verificar já (o cron faz o mesmo de 10 em 10 min).
  { pattern: /^\/api\/novo-rh\/reminders\/run$/, target: p("governance.settings") },
  { pattern: /^\/api\/novo-rh\/audit(\/|$)/, target: p("governance.audit") },
  { pattern: /^\/api\/novo-rh\/structure(\/|$)/, target: p("company.structure") },
  { pattern: /^\/api\/novo-rh\/catalog(\/|$)/, target: p("company.structure") },
  // Entidades legais e a entidade de cada centro (FE-092/093): dados da empresa.
  { pattern: /^\/api\/novo-rh\/legal-entities(\/|$)/, target: p("company.structure") },
  { pattern: /^\/api\/novo-rh\/people\/export\.csv$/, target: p("hr.people_export", "MANAGE") },
  { pattern: /^\/api\/novo-rh\/people\/[^/]+\/kiosk-pin$/, target: p("hr.kiosk_pin", "MANAGE") },
  // Documentos de colaborador e recibos (módulo `documents`, ADR-0040 fase 1).
  { pattern: new RegExp(`^/api/novo-rh/people/${ID}/documents(/|$)`), target: p("hr.documents") },
  { pattern: /^\/api\/novo-rh\/documents\/(overview|archive|pending)$/, target: p("hr.documents") },
  { pattern: /^\/api\/novo-rh\/payslips(\/|$)/, target: p("hr.payslip_import") },
  { pattern: /^\/api\/novo-rh\/people(\/|$)/, target: p("hr.employees") },
  { pattern: /^\/api\/novo-rh\/org-chart$/, methods: GET, target: p("hr.employees") },
  { pattern: /^\/api\/novo-rh\/time\/(holiday-calendars|holidays)(\/|$)/, target: p("company.holidays") },
  { pattern: /^\/api\/novo-rh\/time\/vacation-calendars(\/|$)/, target: p("hr.leave") },
  { pattern: /^\/api\/novo-rh\/time(\/|$)/, target: p("hr.schedules") },
  { pattern: /^\/api\/novo-rh\/attendance(\/|$)/, target: p("hr.attendance") },
  { pattern: /^\/api\/novo-rh\/absences(\/|$)/, target: p("hr.leave") },
  { pattern: /^\/api\/novo-rh\/time-bank(\/|$)/, target: p("hr.attendance") },
  { pattern: /^\/api\/novo-rh\/rosters(\/|$)/, target: p("hr.schedules") },
  { pattern: /^\/api\/novo-rh\/periods(\/|$)/, target: p("hr.closure") },
  { pattern: /^\/api\/novo-rh\/announcements(\/|$)/, target: p("hr.employees") },
  // Convites e pedidos de adesão (FE-054): gestão de pessoas. O pedido em si é público (/api/public/join, pré-auth).
  { pattern: /^\/api\/novo-rh\/invitations(\/|$)/, target: p("hr.employees") },
  // Envio de documentos a vários colaboradores (FE-065): a mesma permissão dos documentos de colaborador.
  { pattern: /^\/api\/novo-rh\/document-distributions(\/|$)/, target: p("hr.documents") },
  { pattern: /^\/api\/novo-rh\/workspace(\/|$)/, target: p("hr.employees") },
  // Exportar uma tabela já vista é leitura (POST só por causa do tamanho do pedido).
  { pattern: /^\/api\/novo-rh\/reports\/export\/xlsx$/, methods: ["POST"], target: p("hr.employees", "READ") },
  { pattern: /^\/api\/novo-rh\/reports(\/|$)/, target: p("hr.employees") },
  { pattern: /^\/api\/novo-rh\/alerts(\/|$)/, target: p("hr.overview") },
  { pattern: /^\/api\/novo-rh\/overview(\/plan|\/today)?$/, target: p("hr.overview") },
  // Avaliações Google: ver (painel) vs. ligar locais ao Google (quem gere os locais).
  { pattern: /^\/api\/novo-rh\/google-reviews\/search$/, target: p("company.locations", "MANAGE") },
  { pattern: /^\/api\/novo-rh\/google-reviews\/locations\/[^/]+\/reviews$/, target: p("hr.overview", "READ") },
  { pattern: /^\/api\/novo-rh\/google-reviews\/locations\/[^/]+$/, target: p("company.locations", "MANAGE") },
  { pattern: /^\/api\/novo-rh\/google-reviews$/, target: p("hr.overview", "READ") },
  // Assistente Mezza: conversar exige ler Escalas; cada alteração exige MANAGE (verificado no caso de uso).
  { pattern: /^\/api\/novo-rh\/assistant\/(status|chat|confirm|cancel|transcribe)$/, target: p("hr.schedules", "READ") },
  // Dashboard executivo: o layout é uma preferência pessoal (só metadados visuais; não concede acesso).
  { pattern: /^\/api\/novo-rh\/dashboard\/layout$/, target: { kind: "base" } },
  { pattern: /^\/api\/novo-rh\/dashboard\/(snapshot|team|birthdays)$/, target: p("hr.overview", "READ") },
  // Caixa de pedidos: área de gestão; cada tipo exige a sua permissão dentro do módulo (READ ver, MANAGE decidir).
  { pattern: /^\/api\/novo-rh\/inbox(\/decide)?$/, target: { kind: "base" } },

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
  // Caixa de pedidos do Portal: cada um vê/decide só o que as suas permissões cobrem (filtro em HrRequestsController).
  { pattern: /^\/api\/hr\/requests(\/|$)/, target: { kind: "base" } },
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

/** Quem pede, para a decisão de rota (= AccessContext sem a identidade). */
export interface RouteSubject extends AccessSubject {
  portalOnly: boolean;
}

/**
 * A decisão do `routeGuard` — pura, para o guarda e para o gerador da matriz
 * de autorização (TK-5) darem sempre o mesmo resultado.
 */
export function isRouteAllowed(subject: RouteSubject, method: string, path: string): boolean {
  const { target, level } = classifyRoute(method, path);
  if (!subject.active || !target) return false;
  switch (target.kind) {
    case "portal":
      return true;
    case "base":
      return !subject.portalOnly;
    case "admin":
      return subject.isAdmin;
    case "permission":
      return can(subject, target.key, level);
  }
}

/** Âmbito da MFA obrigatória (`MFA_ENFORCEMENT`): desligada, só o Novo RH, ou toda a área de gestão. */
export type MfaEnforcement = "off" | "novo-rh" | "all";

/** Perfil de gestão = Admin ou qualquer permissão de gerir (ADR-0024, D2). */
export function isManagementSubject(subject: RouteSubject): boolean {
  return subject.isAdmin || Object.values(subject.permissions).some((l) => l === "MANAGE");
}

/** TK-3: o pedido exige sessão com MFA (`aal2`)? O Portal (`/api/me`) nunca exige. */
export function mfaRequired(subject: RouteSubject, path: string, mode: MfaEnforcement): boolean {
  if (mode === "off" || subject.portalOnly || !isManagementSubject(subject)) return false;
  if (/^\/api\/me(\/|$)/.test(path)) return false;
  return mode === "all" ? path.startsWith("/api/") : /^\/api\/novo-rh(\/|$)/.test(path);
}

/** TK-4: o token foi emitido antes da revogação das sessões deste utilizador? */
export function sessionRevoked(revokedAt: string | null, issuedAtSeconds: number | undefined): boolean {
  if (!revokedAt) return false;
  if (issuedAtSeconds === undefined) return true;
  return issuedAtSeconds * 1000 < Date.parse(revokedAt);
}
