/**
 * Catálogo central de permissões (Utilizadores & Perfis de Acesso 2.0,
 * `.scratch/utilizadores-perfis/catalogo.md`, validado em 2026-10-06).
 * ÚNICA fonte dos nomes de módulos, funcionalidades e permissões especiais —
 * nunca escrever chaves de permissão soltas noutros sítios.
 *
 * Funcionalidade: `NONE | READ | MANAGE`. Permissão especial: `NONE | MANAGE`
 * (concedida ou não). "Utilizadores" não está aqui: é exclusivo do Admin e
 * não é configurável.
 */

export type AccessLevel = "NONE" | "READ" | "MANAGE";

export interface CatalogFunction {
  key: string;
  label: string;
  description: string;
}

export interface CatalogSpecial {
  key: string;
  label: string;
  description: string;
}

export interface CatalogModule {
  key: string;
  label: string;
  description: string;
  functions: CatalogFunction[];
  specials: CatalogSpecial[];
}

export const ACCESS_CATALOG: CatalogModule[] = [
  {
    key: "sales",
    label: "Vendas",
    description: "Painel de vendas, resultados, fechos de caixa e Air Menu.",
    functions: [
      { key: "sales.dashboard", label: "Painel & documentos", description: "Vendas, analítica e documentos Vendus." },
      { key: "sales.results", label: "Resultados", description: "Resumo e crescimento de vendas." },
      { key: "sales.cash_closings", label: "Fechos de caixa", description: "Consultar e corrigir fechos de caixa." },
      { key: "sales.air_menu", label: "Air Menu", description: "Encomendas e integração Air Menu." },
    ],
    specials: [],
  },
  {
    key: "dre",
    label: "DRE",
    description: "Demonstração de resultados e custos.",
    functions: [
      { key: "dre.statement", label: "Demonstrativo", description: "Receita bruta e indicadores." },
      { key: "dre.fixed_costs", label: "Custos fixos", description: "Custos fixos mensais." },
      { key: "dre.variable_costs", label: "Custos variáveis", description: "Custos variáveis mensais." },
    ],
    specials: [],
  },
  {
    key: "finance",
    label: "Financeiro",
    description: "Centros de custo, fornecedores, faturas, pagamentos, bancos e contabilidade.",
    functions: [
      { key: "finance.cost_centers", label: "Centros de custo", description: "Grupos, categorias e canais." },
      { key: "finance.suppliers", label: "Fornecedores", description: "Fornecedores, extratos e calendário de entregas." },
      { key: "finance.invoices", label: "Faturas", description: "Faturas de fornecedor e classificação." },
      { key: "finance.payables", label: "Contas a pagar", description: "Lançamentos a pagar." },
      { key: "finance.recurrences", label: "Recorrências", description: "Despesas recorrentes e ocorrências." },
      { key: "finance.banking", label: "Bancos & conciliação", description: "Contas bancárias, extratos e conciliação." },
      { key: "finance.accounting", label: "Contabilidade", description: "Documentos contabilísticos e IVA." },
    ],
    specials: [],
  },
  {
    key: "stock",
    label: "Stock",
    description: "Artigos, movimentos, compras, contagens, planeamento e receitas.",
    functions: [
      { key: "stock.items", label: "Artigos & categorias", description: "Catálogo de artigos de stock." },
      { key: "stock.movements", label: "Movimentos", description: "Entradas, saídas e consumos." },
      { key: "stock.invoice_imports", label: "Importação de faturas", description: "Importar faturas para stock." },
      { key: "stock.purchase_reviews", label: "Compras por rever", description: "Rever compras antes de entrarem em stock." },
      { key: "stock.counts", label: "Contagens", description: "Contagens físicas de stock." },
      { key: "stock.planning", label: "Planeamento", description: "Previsão, alertas e lista de compras." },
      { key: "stock.recipes", label: "Pizzas & preparações", description: "Receitas, preços e preparações." },
    ],
    specials: [
      { key: "stock.count_confirm", label: "Confirmar contagens", description: "Confirmar contagens, forçar sobreposição e valor manual." },
      { key: "stock.forecast_ops", label: "Operações de previsão", description: "Recalcular histórico, correr previsão e detetar desvios." },
    ],
  },
  {
    key: "crm",
    label: "CRM",
    description: "Clientes, encomendas, contactos e configuração.",
    functions: [
      { key: "crm.customers", label: "Clientes & encomendas", description: "Clientes, encomendas, ações e etiquetas." },
      { key: "crm.contacts", label: "Contactos", description: "Contactos comerciais." },
      { key: "crm.settings", label: "Configuração", description: "Scripts, parâmetros e tipos de ação." },
    ],
    specials: [],
  },
  {
    key: "hr",
    label: "Recursos Humanos",
    description: "Colaboradores, escalas, assiduidade, férias e documentos.",
    functions: [
      { key: "hr.overview", label: "Visão Geral", description: "Painel de RH e turnos por conferir." },
      { key: "hr.employees", label: "Colaboradores", description: "Fichas dos colaboradores e acesso ao Portal." },
      { key: "hr.documents", label: "Documentos dos colaboradores", description: "Dossiê documental dos colaboradores." },
      { key: "hr.schedules", label: "Escalas & Turnos", description: "Turnos, modelos e automatizações." },
      { key: "hr.attendance", label: "Assiduidade", description: "Picagens, conferência e regras." },
      { key: "hr.closure", label: "Fecho mensal", description: "Fechar o mês de assiduidade." },
      { key: "hr.leave", label: "Férias & Ausências", description: "Férias, ausências e saldos." },
      { key: "hr.payments", label: "Pagamentos", description: "Pagamentos aos colaboradores." },
      { key: "hr.history", label: "Histórico", description: "Histórico de alterações de RH." },
    ],
    specials: [
      { key: "hr.sensitive_data", label: "Ver dados sensíveis", description: "NIF, IBAN, NISS e documento de identificação sem máscara." },
      { key: "hr.reopen_month", label: "Reabrir mês fechado", description: "Reabrir um mês de assiduidade já fechado." },
      { key: "hr.payslip_import", label: "Importar recibos", description: "Importação em massa de recibos de vencimento." },
      { key: "hr.kiosk_pin", label: "PIN do quiosque", description: "Definir o PIN de picagem do colaborador." },
    ],
  },
  {
    key: "company",
    label: "Empresa & Estrutura",
    description: "Empresa, locais, cargos, documentos, calendário e dispositivos.",
    functions: [
      { key: "company.organization", label: "Empresa", description: "Dados e logótipo da empresa." },
      { key: "company.locations", label: "Locais", description: "Locais e zona de picagem." },
      { key: "company.positions", label: "Cargos", description: "Cargos profissionais." },
      { key: "company.documents", label: "Documentos da Empresa", description: "Documentos e categorias." },
      { key: "company.calendar", label: "Calendário & Eventos", description: "Eventos da empresa." },
      { key: "company.holidays", label: "Feriados", description: "Feriados nacionais, municipais e próprios." },
      { key: "company.devices", label: "Dispositivos", description: "Emparelhar e revogar quiosques e ecrãs." },
    ],
    specials: [
      { key: "company.confidential_documents", label: "Documentos confidenciais", description: "Documentos da Empresa com visibilidade só para administração." },
    ],
  },
];

export type PermissionMap = Record<string, AccessLevel>;

export const ALL_FUNCTION_KEYS: string[] = ACCESS_CATALOG.flatMap((m) => m.functions.map((f) => f.key));
export const ALL_SPECIAL_KEYS: string[] = ACCESS_CATALOG.flatMap((m) => m.specials.map((s) => s.key));
export const ALL_PERMISSION_KEYS: string[] = [...ALL_FUNCTION_KEYS, ...ALL_SPECIAL_KEYS];

export function isFunctionKey(key: string): boolean {
  return ALL_FUNCTION_KEYS.includes(key);
}

export function isSpecialKey(key: string): boolean {
  return ALL_SPECIAL_KEYS.includes(key);
}

/** Perfis de sistema (criados para cada organização). Admin e Colaborador são protegidos. */
export type SystemProfileKey = "admin" | "manager" | "rh" | "financeiro" | "colaborador";

function moduleAll(moduleKey: string, level: AccessLevel): PermissionMap {
  const mod = ACCESS_CATALOG.find((m) => m.key === moduleKey)!;
  return Object.fromEntries(mod.functions.map((f) => [f.key, level]));
}

/** Valores iniciais dos perfis de sistema (catalogo.md, "Decisões do utilizador"). Chave ausente = NONE. */
export const SYSTEM_PROFILE_DEFAULTS: Record<SystemProfileKey, { name: string; description: string; protected: boolean; permissions: PermissionMap }> = {
  admin: {
    name: "Admin",
    description: "Acesso total ao sistema.",
    protected: true,
    permissions: {
      ...Object.fromEntries(ALL_FUNCTION_KEYS.map((k) => [k, "MANAGE" as const])),
      ...Object.fromEntries(ALL_SPECIAL_KEYS.map((k) => [k, "MANAGE" as const])),
    },
  },
  manager: {
    name: "Manager",
    description: "Gestão operacional: escalas, stock, CRM e vendas.",
    protected: false,
    permissions: {
      ...moduleAll("sales", "READ"),
      ...moduleAll("stock", "MANAGE"),
      ...moduleAll("crm", "MANAGE"),
      "hr.overview": "READ",
      "hr.employees": "READ",
      "hr.documents": "READ",
      "hr.schedules": "MANAGE",
      "hr.attendance": "MANAGE",
      "hr.leave": "MANAGE",
      ...moduleAll("company", "READ"),
    },
  },
  rh: {
    name: "RH",
    description: "Gestão de Recursos Humanos.",
    protected: false,
    permissions: {
      ...moduleAll("hr", "MANAGE"),
      "hr.schedules": "READ",
      "hr.sensitive_data": "MANAGE",
      "hr.payslip_import": "MANAGE",
      ...moduleAll("company", "READ"),
      "company.positions": "MANAGE",
    },
  },
  financeiro: {
    name: "Financeiro",
    description: "Gestão financeira e DRE.",
    protected: false,
    permissions: {
      ...moduleAll("finance", "MANAGE"),
      ...moduleAll("dre", "MANAGE"),
      ...moduleAll("sales", "READ"),
      "stock.purchase_reviews": "READ",
      "stock.invoice_imports": "READ",
      "hr.payments": "READ",
      ...moduleAll("company", "READ"),
    },
  },
  colaborador: {
    name: "Colaborador",
    description: "Só o Portal do Colaborador.",
    protected: true,
    permissions: {},
  },
};

/** Papel antigo (`org_members.role`) → perfil de sistema na migração. */
export const LEGACY_ROLE_TO_PROFILE: Record<string, SystemProfileKey> = {
  admin: "admin",
  manager: "manager",
  hr_viewer: "rh",
  employee: "colaborador",
};
