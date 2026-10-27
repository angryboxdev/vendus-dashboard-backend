import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { InboundAddress } from "../../entities/inbound-address.js";
import type { InboundAttachment, IntakeDestination } from "../../entities/inbound-attachment.js";

/** Endereços de uma empresa (tabela com org_id). */
export interface InboundAddressRepositoryPort {
  listAll(organizationId: OrganizationId): Promise<InboundAddress[]>;
  /** Desativa o ativo e cria o novo numa só transação (pedidos simultâneos ficam em fila). */
  rotate(organizationId: OrganizationId, localPart: string, actor: string, reason: string | null): Promise<InboundAddress>;
}

/**
 * Porta SEM organização (a empresa só se sabe por aqui): procura um endereço pelo identificador.
 * Implementada em `infra/scoped-db` (única porta que cria o `OrganizationId` a partir do destinatário).
 */
export interface InboundAddressLookupPort {
  findByLocalPart(localPart: string): Promise<{ organizationId: OrganizationId; address: InboundAddress } | null>;
}

export type InboundEventStatus = "accepted" | "quarantined" | "ignored";

/** Eventos do webhook (tabela técnica, sem org_id): idempotência e quarentena. */
export interface InboundEventStorePort {
  /**
   * Regista o evento (o mesmo `svix-id` ou o mesmo email contam como o mesmo evento). `duplicate` = já tinha
   * sido tratado até ao fim; `resume` = já existia mas o tratamento ficou a meio (o servidor caiu) — continua-se,
   * porque a gravação dos anexos e o fecho do evento são idempotentes.
   */
  record(event: { webhookId: string; emailId: string; receivedAt: Date }): Promise<{ kind: "new" | "resume"; eventId: string } | { kind: "duplicate" }>;
  complete(
    eventId: string,
    result: { status: InboundEventStatus; organizationId: OrganizationId | null; addressId: string | null; reason: string | null; attachmentsTotal: number; attachmentsAccepted: number },
  ): Promise<void>;
  /** Emails para esta empresa sem nenhum PDF válido, desde a data. */
  countWithoutPdf(organizationId: OrganizationId, since: Date): Promise<number>;
}

export type NewInboundAttachment = Omit<InboundAttachment, "id" | "status" | "invoiceId" | "fileSha256" | "errorCode" | "errorMessage" | "attempts" | "nextAttemptAt" | "lockedAt" | "createdAt" | "updatedAt"> &
  Partial<Pick<InboundAttachment, "status" | "errorCode" | "errorMessage">>;

export interface InboundAttachmentRepositoryPort {
  /** Insere ignorando os que já existem (mesmo email + anexo). */
  insertMany(organizationId: OrganizationId, rows: NewInboundAttachment[]): Promise<void>;
  /** Anexos a processar agora: novos, com nova tentativa vencida, ou presos «em processamento». */
  findDue(organizationId: OrganizationId, now: Date, staleBefore: Date, limit: number): Promise<InboundAttachment[]>;
  /**
   * Reserva o anexo para este processamento (atualização condicional: só se o estado ainda for o lido).
   * `null` = outro processo apanhou-o primeiro.
   */
  claim(organizationId: OrganizationId, attachment: InboundAttachment, now: Date): Promise<InboundAttachment | null>;
  update(organizationId: OrganizationId, attachment: InboundAttachment): Promise<void>;
  listRecent(organizationId: OrganizationId, limit: number): Promise<InboundAttachment[]>;
  countSince(organizationId: OrganizationId, since: Date): Promise<Record<InboundAttachment["status"], number> & { retrying: number }>;
}

export interface IntakeSettingsRepositoryPort {
  getDestination(organizationId: OrganizationId): Promise<IntakeDestination>;
  setDestination(organizationId: OrganizationId, destination: IntakeDestination, actor: string): Promise<void>;
}

/** API Receiving da Resend. */
export interface ReceivedAttachmentInfo {
  id: string;
  filename: string;
  contentType: string | null;
  size: number | null;
  /** Válido durante 1 hora. */
  downloadUrl: string;
}

export interface ResendReceivingPort {
  listAttachments(emailId: string): Promise<ReceivedAttachmentInfo[]>;
  /** Descarrega até `maxBytes` (acima disso falha). */
  download(url: string, maxBytes: number): Promise<{ bytes: Buffer; sha256: string }>;
}

/** Importar no pipeline das faturas (módulo invoices, via adapter). */
export type InvoiceIntakeResult =
  | { outcome: "imported"; invoiceIds: string[] }
  | { outcome: "duplicate"; invoiceId: string | null; message: string }
  | { outcome: "rejected"; code: string; message: string }
  | { outcome: "retry_later"; message: string };

export interface InvoiceIntakePort {
  import(organizationId: OrganizationId, file: { bytes: Buffer; filename: string }, destination: IntakeDestination): Promise<InvoiceIntakeResult>;
}

/** Bytes aleatórios de uma fonte criptográfica (para o identificador do endereço). */
export interface RandomBytesPort {
  bytes(length: number): Uint8Array;
}

/** Configuração da integração (variáveis de ambiente lidas no composition root). */
export interface EmailIntakeConfig {
  /** Chave, segredo e domínio definidos. */
  configured: boolean;
  domain: string | null;
  /** Piloto: só estas empresas podem gerar endereço (vazio = todas). */
  allowedOrganizationIds: readonly string[];
}
