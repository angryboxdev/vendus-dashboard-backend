/**
 * Notificação na aplicação (Novo RH, Fase 1 ticket 10). E-mail/push ficam
 * para a decisão D12 (canais) — a entidade já tem `channel`.
 */
export interface Notification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  /** Caminho interno da app (ex.: `/hr/novo/configuracoes`). */
  link: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface NotifyCommand {
  recipientUserIds: string[];
  kind: string;
  title: string;
  body?: string | null;
  link?: string | null;
  /** Mesmo evento processado duas vezes → uma notificação por pessoa. */
  dedupeKey?: string | null;
}

export class InvalidNotification extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidNotification";
  }
}

const KIND = /^[a-z0-9_.]{3,80}$/;

export function validateNotify(cmd: NotifyCommand): void {
  if (!KIND.test(cmd.kind)) throw new InvalidNotification(`Tipo inválido: ${cmd.kind}`);
  const title = cmd.title?.trim() ?? "";
  if (!title || title.length > 160) throw new InvalidNotification("Título obrigatório (máx. 160).");
  if (cmd.body && cmd.body.length > 1000) throw new InvalidNotification("Texto até 1000 caracteres.");
  // Só ligações internas — nunca para fora da aplicação.
  if (cmd.link && (!/^\/[^/]/.test(cmd.link) || cmd.link.length > 300)) throw new InvalidNotification("Ligação tem de ser um caminho interno.");
}
