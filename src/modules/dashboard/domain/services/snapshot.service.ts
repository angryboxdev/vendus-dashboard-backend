import type {
  AttentionItem,
  CoverageGap,
  DashboardLayout,
  DashboardPerson,
  DashboardRequest,
  TeamCategory,
  TeamCounts,
  UnitRow,
  WidgetPref,
} from "../entities/dashboard.js";

/**
 * Regras puras do Dashboard: contagens, atenção, resumo por centro e layout.
 * Tudo derivado das fontes canónicas (painel, caixa de pedidos, escalas) — o
 * Dashboard não decide estados, só os agrega.
 */

/** Categoria do donut de uma pessoa (null = não entra: terminou, folga, por começar, falta). */
export function teamCategory(p: DashboardPerson): TeamCategory | null {
  if (p.status === "working") return "working";
  if (p.status === "remote") return "remote";
  if (p.status === "break") return "break";
  if (p.status === "absent") return p.absenceCategory === "vacation" ? "vacation" : "absent";
  return null;
}

export function teamCounts(people: DashboardPerson[]): TeamCounts {
  const c: TeamCounts = { total: 0, working: 0, remote: 0, break: 0, vacation: 0, absent: 0, late: 0, missing: 0 };
  for (const p of people) {
    const cat = teamCategory(p);
    if (cat) {
      c[cat]++;
      c.total++;
    }
    if (p.lateMinutes > 0) c.late++;
    if (p.status === "missing") c.missing++;
  }
  return c;
}

/** Linhas de "Requer atenção" (só as que têm contagem), do mais grave ao menos grave. */
export function attentionItems(team: TeamCounts, uncoveredToday: number, requests: DashboardRequest[]): AttentionItem[] {
  const absenceReviews = requests.filter((r) => r.type === "leave" && r.canDecide).length;
  const otherRequests = requests.filter((r) => r.canDecide && r.type !== "leave").length;
  const items: AttentionItem[] = [
    { key: "missing", severity: "critical", count: team.missing, label: team.missing === 1 ? "colaborador em falta (sem marcação)" : "colaboradores em falta (sem marcação)" },
    { key: "uncovered", severity: "critical", count: uncoveredToday, label: uncoveredToday === 1 ? "turno sem cobertura hoje" : "turnos sem cobertura hoje" },
    { key: "absences_review", severity: "urgent", count: absenceReviews, label: absenceReviews === 1 ? "ausência aguarda revisão" : "ausências aguardam revisão" },
    { key: "late", severity: "attention", count: team.late, label: team.late === 1 ? "colaborador atrasado" : "colaboradores atrasados" },
    { key: "requests", severity: "attention", count: otherRequests, label: otherRequests === 1 ? "pedido aguarda aprovação" : "pedidos aguardam aprovação" },
  ];
  return items.filter((i) => i.count > 0);
}

const PRESENT = new Set(["working", "remote", "break", "finished"]);

/**
 * Resumo por centro numa só passagem (sem um pedido por centro). Estado
 * derivado: crítico = faltas sem marcação ou turnos sem cobertura; atenção =
 * atrasos, ausências ou pendentes; senão normal. Ordenado por gravidade.
 */
export function unitRows(people: DashboardPerson[], gaps: CoverageGap[], requests: DashboardRequest[], today: string, locations: { id: string; name: string }[]): UnitRow[] {
  const rows = new Map<string, UnitRow>();
  const row = (id: string | null) => {
    if (!id) return null;
    let r = rows.get(id);
    if (!r) {
      const name = locations.find((l) => l.id === id)?.name ?? "—";
      r = { locationId: id, name, people: 0, present: 0, late: 0, absent: 0, missing: 0, uncovered: 0, pending: 0, state: "normal" };
      rows.set(id, r);
    }
    return r;
  };
  const locOfEmployee = new Map<string, string | null>();
  for (const p of people) {
    locOfEmployee.set(p.employeeId, p.locationId);
    const r = row(p.locationId);
    if (!r) continue;
    r.people++;
    if (PRESENT.has(p.status)) r.present++;
    if (p.lateMinutes > 0) r.late++;
    if (p.status === "absent") r.absent++;
    if (p.status === "missing") r.missing++;
  }
  for (const g of gaps) if (g.date === today) { const r = row(g.locationId); if (r) r.uncovered++; }
  for (const q of requests) {
    if (!q.canDecide) continue;
    const r = row(locOfEmployee.get(q.employeeId) ?? null);
    if (r) r.pending++;
  }
  const weight = (r: UnitRow) => r.missing * 3 + r.uncovered * 3 + r.late * 2 + r.absent + r.pending;
  for (const r of rows.values()) r.state = r.missing > 0 || r.uncovered > 0 ? "critical" : r.late > 0 || r.absent > 0 || r.pending > 0 ? "attention" : "normal";
  const rank = { critical: 0, attention: 1, normal: 2 } as const;
  return [...rows.values()].sort((a, b) => rank[a.state] - rank[b.state] || weight(b) - weight(a) || a.name.localeCompare(b.name, "pt"));
}

// ── Layout ────────────────────────────────────────────────────────────

export interface WidgetSpec {
  id: string;
  defaultOrder: number;
  defaultSpan: number;
  allowedSpans: number[];
}

/** Widgets conhecidos pelo servidor (ids estáveis; o registo visual vive no frontend). */
export const WIDGET_SPECS: WidgetSpec[] = [
  { id: "ATTENTION", defaultOrder: 0, defaultSpan: 6, allowedSpans: [4, 6, 12] },
  { id: "TEAM_STATUS", defaultOrder: 1, defaultSpan: 6, allowedSpans: [6, 12] },
  { id: "LOCATIONS_STATUS", defaultOrder: 2, defaultSpan: 12, allowedSpans: [12] },
  { id: "COVERAGE", defaultOrder: 3, defaultSpan: 5, allowedSpans: [4, 5, 6, 12] },
  { id: "REQUESTS", defaultOrder: 4, defaultSpan: 7, allowedSpans: [6, 7, 12] },
  { id: "GOOGLE_REVIEWS", defaultOrder: 5, defaultSpan: 6, allowedSpans: [4, 6, 12] },
  { id: "BIRTHDAYS", defaultOrder: 6, defaultSpan: 6, allowedSpans: [4, 6, 12] },
  { id: "HOLIDAYS", defaultOrder: 7, defaultSpan: 4, allowedSpans: [4, 6, 12] },
  { id: "REPORTS", defaultOrder: 8, defaultSpan: 4, allowedSpans: [4, 6, 12] },
  { id: "VACANCIES", defaultOrder: 9, defaultSpan: 4, allowedSpans: [4, 6] },
  { id: "ARTICLES", defaultOrder: 10, defaultSpan: 4, allowedSpans: [4, 6, 12] },
];
export const LAYOUT_VERSION = 1;

export class LayoutValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LayoutValidationError";
  }
}

/** Valida o que vem do cliente: só ids conhecidos, tamanhos permitidos, sem repetidos. */
export function validateLayout(input: unknown): DashboardLayout {
  const o = (input ?? {}) as { layoutVersion?: unknown; widgets?: unknown };
  if (!Array.isArray(o.widgets) || o.widgets.length > WIDGET_SPECS.length) throw new LayoutValidationError("Layout inválido.");
  const seen = new Set<string>();
  const widgets: WidgetPref[] = o.widgets.map((w, i) => {
    const x = (w ?? {}) as Record<string, unknown>;
    const spec = WIDGET_SPECS.find((s) => s.id === x.widgetId);
    if (!spec || seen.has(spec.id)) throw new LayoutValidationError("Widget desconhecido ou repetido.");
    seen.add(spec.id);
    const span = Number(x.span);
    if (!spec.allowedSpans.includes(span)) throw new LayoutValidationError(`Tamanho não permitido para ${spec.id}.`);
    return { widgetId: spec.id, order: Number.isInteger(x.order) ? Number(x.order) : i, span, hidden: x.hidden === true };
  });
  return { layoutVersion: LAYOUT_VERSION, widgets };
}

/**
 * Junta as preferências guardadas ao catálogo atual: widgets removidos do
 * produto são ignorados; novos entram na posição padrão sem apagar o resto.
 */
export function mergeLayout(saved: DashboardLayout | null): DashboardLayout {
  const defaults = WIDGET_SPECS.map((s) => ({ widgetId: s.id, order: s.defaultOrder, span: s.defaultSpan, hidden: false }));
  if (!saved) return { layoutVersion: LAYOUT_VERSION, widgets: defaults };
  const known = saved.widgets.filter((w) => WIDGET_SPECS.some((s) => s.id === w.widgetId)).sort((a, b) => a.order - b.order);
  const out = [...known];
  for (const d of defaults) if (!out.some((w) => w.widgetId === d.widgetId)) out.splice(Math.min(d.order, out.length), 0, d);
  return { layoutVersion: LAYOUT_VERSION, widgets: out.map((w, i) => ({ ...w, order: i })) };
}
