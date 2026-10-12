import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { RemindersNotifierPort, RemindersSourcesPort } from "../../domain/ports/out/reminders.ports.js";
import { contractNotices, dayNotices, rulesFrom, type Notice } from "../../domain/services/reminders.service.js";

const CONCURRENCY = 6;

/**
 * Avisos automáticos (FE-111): corre por organização (cron de 10 em 10 min,
 * ou "Verificar agora"). Só envia o que as regras efetivas de cada pessoa
 * ligam (cascata D3); o centro de notificações descarta repetidos pela chave.
 */
export class RemindersUseCases {
  constructor(
    private readonly sources: RemindersSourcesPort,
    private readonly notifier: RemindersNotifierPort,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async run(org: OrganizationId): Promise<{ people: number; notices: number; byKind: Record<string, number> }> {
    const [today, employees, admins] = await Promise.all([this.sources.today(org), this.sources.employees(org), this.sources.adminUsers(org)]);
    const now = this.now();
    const byKind: Record<string, number> = {};
    let sent = 0;
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, employees.length) }, async () => {
        while (next < employees.length) {
          const e = employees[next++]!;
          const rules = rulesFrom(await this.sources.settings(org, e.id, today));
          const notices: Notice[] = [];
          if (rules.missingIn.enabled || rules.openAfterEnd.enabled) notices.push(...dayNotices(e, await this.sources.day(org, e.id, today), rules, now));
          if (rules.probationEnd.enabled || rules.contractEnd.enabled) notices.push(...contractNotices(e, await this.sources.contracts(org, e.id), rules, today));
          for (const n of notices) {
            const users = new Set<string>();
            if (n.to.employee) {
              const u = await this.sources.employeeUser(org, e.id);
              if (u) users.add(u);
            }
            if (n.to.managers) for (const u of await this.sources.directManagerUsers(org, e.id, today)) users.add(u);
            if (n.to.admins) for (const u of admins) users.add(u);
            if (!users.size) continue;
            await this.notifier.notify(org, [...users], { title: n.title, body: n.body, link: n.link, dedupeKey: n.dedupeKey });
            byKind[n.kind] = (byKind[n.kind] ?? 0) + 1;
            sent++;
          }
        }
      }),
    );
    return { people: employees.length, notices: sent, byKind };
  }
}
