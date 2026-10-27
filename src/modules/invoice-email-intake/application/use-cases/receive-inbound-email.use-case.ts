import { addressAcceptedAt } from "../../domain/entities/inbound-address.js";
import { decideAttachments, ourLocalParts } from "../../domain/services/intake-rules.js";
import type {
  ReceiveInboundEmailCommand,
  ReceiveInboundEmailPort,
  ReceiveInboundEmailResult,
} from "../../domain/ports/in/email-intake.ports.js";
import type {
  EmailIntakeConfig,
  InboundAddressLookupPort,
  InboundAttachmentRepositoryPort,
  InboundEventStorePort,
  IntakeSettingsRepositoryPort,
  NewInboundAttachment,
} from "../../domain/ports/out/email-intake.out-ports.js";

/**
 * Webhook `email.received` (assinatura já verificada): regista o evento (idempotente), descobre a empresa SÓ
 * pelo destinatário e grava um registo por PDF. Não descarrega nem importa nada — responde depressa; o
 * processamento corre a seguir (`ProcessInboundAttachmentsUseCase`).
 */
export class ReceiveInboundEmailUseCase implements ReceiveInboundEmailPort {
  constructor(
    private readonly events: InboundEventStorePort,
    private readonly lookup: InboundAddressLookupPort,
    private readonly settings: IntakeSettingsRepositoryPort,
    private readonly attachments: InboundAttachmentRepositoryPort,
    private readonly config: EmailIntakeConfig,
  ) {}

  async execute(command: ReceiveInboundEmailCommand): Promise<ReceiveInboundEmailResult> {
    if (command.type !== "email.received") return { status: "ignored", reason: "event_type" };
    if (!this.config.domain) return { status: "ignored", reason: "not_configured" };

    const recorded = await this.events.record({ webhookId: command.webhookId, emailId: command.emailId, receivedAt: command.receivedAt });
    if (recorded.kind === "duplicate") return { status: "duplicate" };
    const { eventId } = recorded;
    const total = command.attachments.length;
    const quarantine = async (reason: "unknown_address" | "inactive_address" | "ambiguous_recipients", organizationId: Parameters<InboundEventStorePort["complete"]>[1]["organizationId"] = null) => {
      await this.events.complete(eventId, { status: "quarantined", organizationId, addressId: null, reason, attachmentsTotal: total, attachmentsAccepted: 0 });
      return { status: "quarantined" as const, reason };
    };

    const matches = (await Promise.all(ourLocalParts(command.recipients, this.config.domain).map((l) => this.lookup.findByLocalPart(l)))).filter(
      (m): m is NonNullable<typeof m> => m !== null,
    );
    if (matches.length === 0) return quarantine("unknown_address");
    // Endereços de empresas diferentes no mesmo email: não se sabe a quem pertence — nada é importado.
    if (new Set(matches.map((m) => m.organizationId)).size > 1) return quarantine("ambiguous_recipients");
    const organizationId = matches[0]!.organizationId;
    const address = matches.find((m) => addressAcceptedAt(m.address, command.receivedAt))?.address;
    if (!address) return quarantine("inactive_address", organizationId);

    const destination = await this.settings.getDestination(organizationId);
    // Só os PDFs ficam registados (aceites ou recusados por tamanho/quantidade); imagens de assinatura e
    // logótipos não entram no histórico.
    const pdfs = decideAttachments(command.attachments).filter((d) => d.decision.accept || d.decision.code !== "not_pdf");
    const rows: NewInboundAttachment[] = pdfs.map(({ meta, decision }) => ({
      eventId,
      addressId: address.id,
      emailId: command.emailId,
      attachmentId: meta.id,
      filename: meta.filename,
      contentType: meta.contentType,
      sizeBytes: meta.size,
      sender: command.from,
      receivedAt: command.receivedAt,
      destination,
      ...(!decision.accept && { status: "rejected" as const, errorCode: decision.code, errorMessage: decision.message }),
    }));
    if (rows.length > 0) await this.attachments.insertMany(organizationId, rows);

    const accepted = pdfs.filter((d) => d.decision.accept).length;
    await this.events.complete(eventId, {
      status: "accepted",
      organizationId,
      addressId: address.id,
      reason: accepted === 0 ? "no_valid_pdf" : null,
      attachmentsTotal: total,
      attachmentsAccepted: accepted,
    });
    return { status: "accepted", organizationId, acceptedAttachments: accepted };
  }
}
