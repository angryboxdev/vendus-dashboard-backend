import type { OrganizationId } from "../../../../kernel/organization-id.js";
import {
  completeInboundEmailEvent,
  countInboundEmailsWithoutPdf,
  findInboundAddressByLocalPart,
  recordInboundEmailEvent,
} from "../../../../infra/scoped-db/inbound-email-store.js";
import type { InboundAddress } from "../../domain/entities/inbound-address.js";
import type { InboundAddressLookupPort, InboundEventStorePort } from "../../domain/ports/out/email-intake.out-ports.js";

/** Portas sem organização → `infra/scoped-db/inbound-email-store.ts` (a única porta assim). */
export class InfraInboundEmailStoreAdapter implements InboundAddressLookupPort, InboundEventStorePort {
  async findByLocalPart(localPart: string): Promise<{ organizationId: OrganizationId; address: InboundAddress } | null> {
    const row = await findInboundAddressByLocalPart(localPart);
    if (!row) return null;
    const { organizationId, ...address } = row;
    return { organizationId, address };
  }

  record(event: { webhookId: string; emailId: string; receivedAt: Date }) {
    return recordInboundEmailEvent(event);
  }

  complete(eventId: string, result: Parameters<InboundEventStorePort["complete"]>[1]) {
    return completeInboundEmailEvent(eventId, result);
  }

  countWithoutPdf(organizationId: OrganizationId, since: Date) {
    return countInboundEmailsWithoutPdf(organizationId, since);
  }
}
