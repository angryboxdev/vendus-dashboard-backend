import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { formatAddress, localPartFromRandomBytes, LOCAL_PART_LENGTH } from "../../domain/entities/inbound-address.js";
import type { IntakeDestination } from "../../domain/entities/inbound-attachment.js";
import { EmailIntakeNotAllowedError, EmailIntakeNotConfiguredError } from "../../domain/errors.js";
import type {
  EmailIntakeDTO,
  GetEmailIntakePort,
  RotateInboundAddressPort,
  SetEmailIntakeDestinationPort,
} from "../../domain/ports/in/email-intake.ports.js";
import type {
  EmailIntakeConfig,
  InboundAddressRepositoryPort,
  InboundAttachmentRepositoryPort,
  InboundEventStorePort,
  IntakeSettingsRepositoryPort,
  RandomBytesPort,
} from "../../domain/ports/out/email-intake.out-ports.js";

const RECENT = 20;
const PREVIOUS = 5;
const COUNTS_DAYS = 30;

const isAllowed = (config: EmailIntakeConfig, organizationId: OrganizationId) =>
  config.allowedOrganizationIds.length === 0 || config.allowedOrganizationIds.includes(organizationId);

/** Ecrã «Faturas por email»: endereço ativo, destino, endereços anteriores e o que chegou nos últimos 30 dias. */
export class GetEmailIntakeUseCase implements GetEmailIntakePort {
  constructor(
    private readonly addresses: InboundAddressRepositoryPort,
    private readonly attachments: InboundAttachmentRepositoryPort,
    private readonly events: InboundEventStorePort,
    private readonly settings: IntakeSettingsRepositoryPort,
    private readonly config: EmailIntakeConfig,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute({ organizationId }: { organizationId: OrganizationId }): Promise<EmailIntakeDTO> {
    const since = new Date(this.now().getTime() - COUNTS_DAYS * 86_400_000);
    const [all, recent, counts, withoutPdf, destination] = await Promise.all([
      this.addresses.listAll(organizationId),
      this.attachments.listRecent(organizationId, RECENT),
      this.attachments.countSince(organizationId, since),
      this.events.countWithoutPdf(organizationId, since),
      this.settings.getDestination(organizationId),
    ]);
    const domain = this.config.domain;
    const active = all.find((a) => a.status === "active");
    return {
      configured: this.config.configured,
      allowed: isAllowed(this.config, organizationId),
      address: active && domain ? { email: formatAddress(active.localPart, domain), createdAt: active.createdAt.toISOString() } : null,
      previousAddresses: domain
        ? all
            .filter((a) => a.status === "inactive")
            .sort((x, y) => (y.deactivatedAt?.getTime() ?? 0) - (x.deactivatedAt?.getTime() ?? 0))
            .slice(0, PREVIOUS)
            .map((a) => ({ email: formatAddress(a.localPart, domain), createdAt: a.createdAt.toISOString(), deactivatedAt: a.deactivatedAt?.toISOString() ?? null }))
        : [],
      destination,
      counts: {
        imported: counts.imported,
        duplicate: counts.duplicate,
        rejected: counts.rejected,
        failed: counts.read_error - counts.retrying,
        pending: counts.received + counts.processing + counts.retrying,
        emailsWithoutPdf: withoutPdf,
      },
      recent: recent.map((a) => ({
        id: a.id,
        filename: a.filename,
        sender: a.sender,
        receivedAt: a.receivedAt.toISOString(),
        status: a.status,
        retrying: a.status === "read_error" && a.nextAttemptAt !== null,
        invoiceId: a.invoiceId,
        message: a.errorMessage,
      })),
    };
  }
}

/**
 * «Gerar novo endereço» (ou o primeiro): identificador aleatório novo; o anterior é desativado na mesma
 * transação e deixa de ser aceite pelo Mezza (os emails recebidos antes da rotação ainda entram — regra dos
 * eventos atrasados). Fica registado quem, quando e porquê.
 */
export class RotateInboundAddressUseCase implements RotateInboundAddressPort {
  constructor(
    private readonly addresses: InboundAddressRepositoryPort,
    private readonly random: RandomBytesPort,
    private readonly config: EmailIntakeConfig,
  ) {}

  async execute(command: { organizationId: OrganizationId; actor: string; reason: string | null }): Promise<{ email: string; createdAt: string }> {
    if (!this.config.configured || !this.config.domain) throw new EmailIntakeNotConfiguredError();
    if (!isAllowed(this.config, command.organizationId)) throw new EmailIntakeNotAllowedError();
    const reason = command.reason?.trim().slice(0, 300) || null;
    // Colisão do identificador (única em todo o sistema) é praticamente impossível; mesmo assim, tenta outra vez.
    for (let attempt = 0; ; attempt++) {
      try {
        const created = await this.addresses.rotate(command.organizationId, localPartFromRandomBytes(this.random.bytes(LOCAL_PART_LENGTH)), command.actor, reason);
        return { email: formatAddress(created.localPart, this.config.domain), createdAt: created.createdAt.toISOString() };
      } catch (e) {
        if (attempt >= 2) throw e;
      }
    }
  }
}

export class SetEmailIntakeDestinationUseCase implements SetEmailIntakeDestinationPort {
  constructor(private readonly settings: IntakeSettingsRepositoryPort) {}

  async execute(command: { organizationId: OrganizationId; destination: IntakeDestination; actor: string }): Promise<void> {
    if (command.destination !== "finance" && command.destination !== "stock") throw new Error("destination must be finance or stock");
    await this.settings.setDestination(command.organizationId, command.destination, command.actor);
  }
}
