import type { OrganizationId } from "../../../../../kernel/organization-id.js";
import type { InboundAttachmentStatus, IntakeDestination } from "../../entities/inbound-attachment.js";
import type { AttachmentMeta } from "../../services/intake-rules.js";

// ── Webhook (Resend `email.received`, já com a assinatura verificada) ─────────

export interface ReceiveInboundEmailCommand {
  /** `svix-id` — igual nas repetições da mesma entrega. */
  webhookId: string;
  type: string;
  emailId: string;
  /** Hora a que a Resend recebeu o email (regra dos eventos atrasados). */
  receivedAt: Date;
  from: string | null;
  /** Destinatários (to + cc). */
  recipients: string[];
  attachments: AttachmentMeta[];
}

export type ReceiveInboundEmailResult =
  | { status: "accepted"; organizationId: OrganizationId; acceptedAttachments: number }
  | { status: "quarantined"; reason: "unknown_address" | "inactive_address" | "ambiguous_recipients" }
  | { status: "ignored"; reason: string }
  | { status: "duplicate" };

export interface ReceiveInboundEmailPort {
  execute(command: ReceiveInboundEmailCommand): Promise<ReceiveInboundEmailResult>;
}

// ── Processamento (logo a seguir ao webhook e pelo cron das novas tentativas) ─

export interface ProcessInboundAttachmentsResult {
  processed: number;
  imported: number;
  duplicates: number;
  rejected: number;
  failed: number;
}

export interface ProcessInboundAttachmentsPort {
  execute(command: { organizationId: OrganizationId; limit?: number }): Promise<ProcessInboundAttachmentsResult>;
}

// ── Ecrã «Faturas por email» ─────────────────────────────────────────────────

export interface EmailIntakeAttachmentDTO {
  id: string;
  filename: string;
  sender: string | null;
  receivedAt: string;
  status: InboundAttachmentStatus;
  /** Ainda vai ser tentado de novo (falha passageira). */
  retrying: boolean;
  invoiceId: string | null;
  message: string | null;
}

export interface EmailIntakeDTO {
  /** A integração está configurada no servidor (chave, segredo do webhook e domínio). */
  configured: boolean;
  /** Esta empresa pode ter endereço (piloto: lista de empresas autorizadas, se definida). */
  allowed: boolean;
  address: { email: string; createdAt: string } | null;
  previousAddresses: { email: string; createdAt: string; deactivatedAt: string | null }[];
  destination: IntakeDestination;
  /** Últimos 30 dias. */
  counts: { imported: number; duplicate: number; rejected: number; failed: number; pending: number; emailsWithoutPdf: number };
  recent: EmailIntakeAttachmentDTO[];
}

export interface GetEmailIntakePort {
  execute(command: { organizationId: OrganizationId }): Promise<EmailIntakeDTO>;
}

export interface RotateInboundAddressPort {
  /** Gera o primeiro endereço ou substitui o atual (o anterior deixa de ser aceite pelo Mezza). */
  execute(command: { organizationId: OrganizationId; actor: string; reason: string | null }): Promise<{ email: string; createdAt: string }>;
}

export interface SetEmailIntakeDestinationPort {
  execute(command: { organizationId: OrganizationId; destination: IntakeDestination; actor: string }): Promise<void>;
}
