import type { CrmContact, CrmCustomer, CrmNextFollowUp, CrmOrder, CrmParams, CrmSegment } from "./crmTypes.js";

// ─── Utilitários de data ──────────────────────────────────────────────────────

/** Adiciona N dias a uma string YYYY-MM-DD */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Dias entre duas strings YYYY-MM-DD (positivo = 'to' é depois de 'from') */
function daysBetween(from: string, to: string): number {
  const a = new Date(from + "T12:00:00Z");
  const b = new Date(to + "T12:00:00Z");
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Helpers de log de contactos ─────────────────────────────────────────────

/** Verifica se um script já foi enviado ao cliente */
function hasScript(contacts: CrmContact[], code: string): boolean {
  return contacts.some((c) => c.scriptCode === code && c.direction === "Enviado");
}

/** Data do último envio de um script (null se nunca enviado) */
function lastScriptDate(contacts: CrmContact[], code: string): string | null {
  const sent = contacts
    .filter((c) => c.scriptCode === code && c.direction === "Enviado")
    .map((c) => c.contactedAt.slice(0, 10))
    .sort();
  return sent.length > 0 ? (sent[sent.length - 1] ?? null) : null;
}

/** Monta o resultado do follow-up */
function followUp(
  date: string,
  scriptCode: string,
  reason: string
): CrmNextFollowUp {
  const t = today();
  const daysUntil = daysBetween(t, date);
  return { date, scriptCode, reason, isOverdue: daysUntil < 0, daysUntil };
}

// ─── Engine principal ─────────────────────────────────────────────────────────

/**
 * Calcula o próximo follow-up de um cliente.
 *
 * Função pura — sem I/O.
 * Implementa a lógica em cascata do framework CRM, segmento a segmento.
 *
 * @param customer  Dados base do cliente (inclui segment calculado)
 * @param segment   Segmento atual (calculado externamente por calculateSegment)
 * @param orders    Pedidos concluídos, ordenados por data
 * @param contacts  Log de contactos
 * @param params    Parâmetros lidos da BD
 */
export function calculateNextFollowUp(
  customer: CrmCustomer,
  segment: CrmSegment,
  orders: CrmOrder[],
  contacts: CrmContact[],
  params: CrmParams
): CrmNextFollowUp | null {
  if (segment === "INATIVO") return null;

  const completedOrders = orders
    .filter((o) => o.status === "concluído")
    .sort((a, b) => a.orderDate.localeCompare(b.orderDate));

  const firstOrderDate = completedOrders[0]?.orderDate ?? null;
  const lastOrderDate = completedOrders[completedOrders.length - 1]?.orderDate ?? null;

  switch (segment) {
    case "SEG-01":
      return seg01FollowUp(firstOrderDate, contacts, params);

    case "SEG-02":
      return seg02FollowUp(firstOrderDate, contacts, params);

    case "SEG-03":
      return seg03FollowUp(lastOrderDate, contacts, params);

    case "SEG-04":
      return seg04FollowUp(lastOrderDate, contacts, params, completedOrders.length, orders.reduce((s, o) => s + (o.status === "concluído" ? o.totalValue : 0), 0));

    case "SEG-05":
      return seg05FollowUp(
        lastOrderDate,
        contacts,
        params,
        completedOrders.length,
        orders.reduce((s, o) => s + (o.status === "concluído" ? o.totalValue : 0), 0)
      );

    case "SEG-06":
      return seg06FollowUp(lastOrderDate, contacts, params);

    case "SEG-07":
      return seg07FollowUp(customer.registeredAt, customer.seg07Path, contacts, params);

    default:
      return null;
  }
}

// ─── SEG-01 · Novo ────────────────────────────────────────────────────────────

function seg01FollowUp(
  firstOrderDate: string | null,
  contacts: CrmContact[],
  params: CrmParams
): CrmNextFollowUp | null {
  if (!firstOrderDate) return null;

  const t = today();
  const daysSince = daysBetween(firstOrderDate, t);

  // 1. 2.1.1 — não enviado ainda
  if (!hasScript(contacts, "2.1.1") && !hasScript(contacts, "CEN-06b")) {
    return followUp(firstOrderDate, "2.1.1", "Agradecimento D+0 do 1º pedido");
  }

  // 2. 2.1.2 — não enviado, D+3
  if (!hasScript(contacts, "2.1.2") && daysSince <= params.seg01Days212) {
    return followUp(
      addDays(firstOrderDate, params.seg01Days212),
      "2.1.2",
      "Follow-up Instagram D+3"
    );
  }

  // 3. 2.1.3 — não enviado, D+10
  if (!hasScript(contacts, "2.1.3") && daysSince <= params.seg01Days213) {
    return followUp(
      addDays(firstOrderDate, params.seg01Days213),
      "2.1.3",
      "Oferta 2ª compra D+10"
    );
  }

  // 4. D+15 — transição para SEG-02
  return followUp(
    addDays(firstOrderDate, params.seg01DaysTransition),
    "→SEG-02",
    "Transição automática para Em Ativação D+15"
  );
}

// ─── SEG-02 · Em Ativação ────────────────────────────────────────────────────

function seg02FollowUp(
  firstOrderDate: string | null,
  contacts: CrmContact[],
  params: CrmParams
): CrmNextFollowUp | null {
  if (!firstOrderDate) return null;

  const t = today();
  const daysSince = daysBetween(firstOrderDate, t);

  // 1. 2.2.1 — D+18
  if (!hasScript(contacts, "2.2.1")) {
    return followUp(
      addDays(firstOrderDate, params.seg02Days221),
      "2.2.1",
      "Investigação ausência D+18"
    );
  }

  // 2. 2.2.2 — D+25 (ou D+7 após tag ausência_justificada / só_não_pedi)
  if (!hasScript(contacts, "2.2.2") && daysSince <= params.seg02Days222) {
    return followUp(
      addDays(firstOrderDate, params.seg02Days222),
      "2.2.2",
      "Empurrão final 20% off D+25"
    );
  }

  // 3. D+31 — transição para SEG-05
  return followUp(
    addDays(firstOrderDate, params.seg02DaysTransition),
    "→SEG-05",
    "Transição automática para Em Risco D+31"
  );
}

// ─── SEG-03 · Recorrente ─────────────────────────────────────────────────────

function seg03FollowUp(
  lastOrderDate: string | null,
  contacts: CrmContact[],
  params: CrmParams
): CrmNextFollowUp | null {
  if (!lastOrderDate) return null;

  // 2.3.1 pós-pedido — enviado em D+1
  if (!hasScript(contacts, "2.3.1")) {
    return followUp(
      addDays(lastOrderDate, 1),
      "2.3.1",
      "Pós-pedido orgânico D+1"
    );
  }

  // 2.3.2 cíclico a cada N dias desde o último enviado
  const last232 = lastScriptDate(contacts, "2.3.2");
  const baseDate = last232 ?? lastOrderDate;
  const nextDate = addDays(baseDate, params.seg03CycleDays);

  return followUp(nextDate, "2.3.2", `Novidade/conteúdo cíclico a cada ${params.seg03CycleDays} dias`);
}

// ─── SEG-04 · VIP ────────────────────────────────────────────────────────────

function seg04FollowUp(
  lastOrderDate: string | null,
  contacts: CrmContact[],
  params: CrmParams,
  orderCount: number,
  ltv: number
): CrmNextFollowUp | null {
  if (!lastOrderDate) return null;

  const t = today();
  const daysSinceLast = daysBetween(lastOrderDate, t);

  // 2.4.1 — reconhecimento de upgrade VIP (disparo único)
  if (!hasScript(contacts, "2.4.1")) {
    return followUp(t, "2.4.1", "Reconhecimento de upgrade para VIP");
  }

  // CEN-09 — queda de frequência (25+ dias sem pedir)
  if (daysSinceLast >= params.seg04RiskDays && !hasScript(contacts, "CEN-09")) {
    return followUp(t, "CEN-09", `Queda de frequência — ${daysSinceLast} dias sem pedir`);
  }

  // 2.4.5 check-in periódico
  const last245 = lastScriptDate(contacts, "2.4.5");
  const baseDate = last245 ?? lastOrderDate;
  const nextDate = addDays(baseDate, params.seg04CheckinDays);

  // Se já passou o prazo → hoje
  const due = nextDate < t ? t : nextDate;
  return followUp(due, "2.4.5", `Check-in VIP a cada ${params.seg04CheckinDays} dias`);
}

// ─── SEG-05 · Em Risco ───────────────────────────────────────────────────────

function seg05FollowUp(
  lastOrderDate: string | null,
  contacts: CrmContact[],
  params: CrmParams,
  orderCount: number,
  ltv: number
): CrmNextFollowUp | null {
  if (!lastOrderDate) return null;

  // Determinar se veio de VIP (4+ pedidos ou LTV >= 100)
  const cameFromVip = orderCount >= params.vipMinOrders || ltv >= params.vipMinLtv;

  if (cameFromVip) {
    // 2.5.1-VIP — D+50
    if (!hasScript(contacts, "2.5.1-VIP")) {
      return followUp(
        addDays(lastOrderDate, params.seg05Days251Vip),
        "2.5.1-VIP",
        "Curiosidade genuína VIP D+50"
      );
    }
    // 2.5.2 — D+58
    if (!hasScript(contacts, "2.5.2")) {
      return followUp(
        addDays(lastOrderDate, params.seg05Days252Vip),
        "2.5.2",
        "Oferta de retorno 25% off D+58 (VIP)"
      );
    }
  } else {
    // 2.5.1 — D+35
    if (!hasScript(contacts, "2.5.1")) {
      return followUp(
        addDays(lastOrderDate, params.seg05Days251),
        "2.5.1",
        "Curiosidade genuína D+35"
      );
    }
    // 2.5.2 — D+50
    if (!hasScript(contacts, "2.5.2")) {
      return followUp(
        addDays(lastOrderDate, params.seg05Days252Rec),
        "2.5.2",
        "Oferta de retorno 25% off D+50"
      );
    }
  }

  // Transição para SEG-06
  return followUp(
    addDays(lastOrderDate, params.seg05DaysTransition),
    "→SEG-06",
    "Transição automática para Perdido D+61"
  );
}

// ─── SEG-06 · Perdido ────────────────────────────────────────────────────────

function seg06FollowUp(
  lastOrderDate: string | null,
  contacts: CrmContact[],
  params: CrmParams
): CrmNextFollowUp | null {
  if (!lastOrderDate) return null;

  const t = today();
  const daysSinceLast = daysBetween(lastOrderDate, t);

  // 2.6.1 win-back — D+65 (disparo único)
  if (!hasScript(contacts, "2.6.1") && daysSinceLast <= params.seg06SleepDays) {
    return followUp(
      addDays(lastOrderDate, params.seg06Days261),
      "2.6.1",
      "Win-back final 40% off D+65"
    );
  }

  // > 79 dias → dormir contacto (marcar Inativo Definitivo)
  if (daysSinceLast > params.seg06SleepDays) {
    return followUp(t, "dormir", "Sem conversão após D+79 — marcar Inativo Definitivo");
  }

  return null;
}

// ─── SEG-07 · Carrinho Abandonado ────────────────────────────────────────────

function seg07FollowUp(
  registeredAt: string,
  seg07Path: "A" | "B" | null,
  contacts: CrmContact[],
  params: CrmParams
): CrmNextFollowUp | null {
  const t = today();
  const daysSinceReg = daysBetween(registeredAt, t);

  // Caminho A ou B: 1º contacto D+1
  const firstScript = seg07Path === "B" ? "2.7.1" : "2.7.0";
  const hasFirst = hasScript(contacts, firstScript);

  if (!hasFirst && daysSinceReg <= params.seg07DaysFirst + 1) {
    return followUp(
      addDays(registeredAt, params.seg07DaysFirst),
      firstScript,
      seg07Path === "B"
        ? "Carrinho abandonado — investigar D+1"
        : "Boas-vindas D+1"
    );
  }

  // 2.7.2 oferta de 1º pedido — D+7
  if (!hasScript(contacts, "2.7.2") && daysSinceReg <= params.seg07Days272) {
    return followUp(
      addDays(registeredAt, params.seg07Days272),
      "2.7.2",
      "Oferta 1º pedido 20% off D+7"
    );
  }

  // D+21 sem conversão → Inativo Definitivo
  if (daysSinceReg > params.seg07InactiveDays) {
    return followUp(t, "dormir", "Lead frio — sem conversão após D+21, marcar Inativo Definitivo");
  }

  return null;
}
