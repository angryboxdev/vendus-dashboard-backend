import { getSupabaseServiceRole } from "../infra/supabaseClient.js";
import { listCustomers, enrichCustomer } from "./crmCustomerService.js";
import type { CrmCustomerEnriched } from "../domain/crmTypes.js";

function getDb() {
  const db = getSupabaseServiceRole();
  if (!db) throw new Error("Supabase não configurado");
  return db;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type DashboardData = {
  attention: {
    overdue:      CrmCustomerEnriched[];  // follow-up atrasado
    today:        CrmCustomerEnriched[];  // contactar hoje
    next3days:    number;                 // contador próximos 3 dias
    birthdays:    BirthdayEntry[];        // aniversariantes esta semana
  };
  bySegment: Record<string, number>;
  contacts: {
    sentThisWeek:   number;
    responseRate:   number;              // % respostas esta semana
    prevResponseRate: number;            // % semana anterior
  };
};

export type BirthdayEntry = {
  customerId: string;
  name: string;
  birthday: string;  // MM-DD
};

export async function getDashboard(): Promise<DashboardData> {
  const t = today();
  const in3 = addDays(t, 3);
  const weekEnd = addDays(t, 7);

  // Carregar todos os clientes activos
  const rawCustomers = await listCustomers({ inactive: false, limit: 500 });

  // Enriquecer em paralelo (lotes de 20 para não sobrecarregar)
  const enriched: CrmCustomerEnriched[] = [];
  const batchSize = 20;
  for (let i = 0; i < rawCustomers.length; i += batchSize) {
    const batch = rawCustomers.slice(i, i + batchSize);
    const results = await Promise.all(batch.map((c) => enrichCustomer(c)));
    enriched.push(...results);
  }

  // ── Atenção Esta Semana ───────────────────────────────────────────────────
  const overdue:   CrmCustomerEnriched[] = [];
  const todayList: CrmCustomerEnriched[] = [];
  let next3Count = 0;

  for (const c of enriched) {
    const fu = c.nextFollowUp;
    if (!fu || fu.scriptCode === "dormir" || fu.scriptCode.startsWith("→")) continue;

    if (fu.date < t) {
      overdue.push(c);
    } else if (fu.date === t) {
      todayList.push(c);
    } else if (fu.date <= in3) {
      next3Count++;
    }
  }

  // Ordenar atrasados por data (mais antigo primeiro)
  overdue.sort((a, b) => (a.nextFollowUp?.date ?? "").localeCompare(b.nextFollowUp?.date ?? ""));
  // Ordenar hoje por segmento (SEG-01 primeiro, urgência decrescente)
  todayList.sort((a, b) => a.segment.localeCompare(b.segment));

  // ── Aniversariantes desta semana ──────────────────────────────────────────
  const birthdays: BirthdayEntry[] = [];
  const todayMMDD = t.slice(5); // MM-DD
  const weekEndMMDD = weekEnd.slice(5);

  for (const c of enriched) {
    if (!c.birthday) continue;
    const mmdd = c.birthday.slice(5); // MM-DD
    if (mmdd >= todayMMDD && mmdd <= weekEndMMDD) {
      birthdays.push({
        customerId: c.id,
        name: `${c.firstName} ${c.lastName ?? ""}`.trim(),
        birthday: mmdd,
      });
    }
  }
  birthdays.sort((a, b) => a.birthday.localeCompare(b.birthday));

  // ── Distribuição por segmento ─────────────────────────────────────────────
  const bySegment: Record<string, number> = {};
  for (const c of enriched) {
    bySegment[c.segment] = (bySegment[c.segment] ?? 0) + 1;
  }

  // ── Contactos esta semana vs semana anterior ──────────────────────────────
  const db = getDb();
  const thisWeekStart = addDays(t, -6);
  const prevWeekStart = addDays(t, -13);
  const prevWeekEnd   = addDays(t, -7);

  const [thisWeekRes, prevWeekRes] = await Promise.all([
    db.from("crm_contacts")
      .select("status, response")
      .gte("contacted_at", thisWeekStart)
      .lte("contacted_at", t + "T23:59:59Z")
      .eq("direction", "Enviado"),
    db.from("crm_contacts")
      .select("status, response")
      .gte("contacted_at", prevWeekStart)
      .lte("contacted_at", prevWeekEnd + "T23:59:59Z")
      .eq("direction", "Enviado"),
  ]);

  const thisWeekContacts = (thisWeekRes.data as { status: string; response: string | null }[]) ?? [];
  const prevWeekContacts = (prevWeekRes.data as { status: string; response: string | null }[]) ?? [];

  const responseRate     = calcResponseRate(thisWeekContacts);
  const prevResponseRate = calcResponseRate(prevWeekContacts);

  return {
    attention: {
      overdue,
      today: todayList,
      next3days: next3Count,
      birthdays,
    },
    bySegment,
    contacts: {
      sentThisWeek: thisWeekContacts.length,
      responseRate,
      prevResponseRate,
    },
  };
}

function calcResponseRate(contacts: { status: string; response: string | null }[]): number {
  if (contacts.length === 0) return 0;
  const responded = contacts.filter((c) => c.status === "Respondeu").length;
  return Math.round((responded / contacts.length) * 100);
}
