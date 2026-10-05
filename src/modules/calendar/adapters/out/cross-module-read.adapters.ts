import type { OrganizationId } from "../../../../kernel/organization-id.js";
import type { ListLocationsPort } from "../../../locations/domain/ports/in/list-locations.port.js";
import type { ListCompanyDocumentsPort } from "../../../documents/domain/ports/in/company-document.ports.js";
import type {
  CalendarLocationReadPort,
  DocumentDeadlineReadPort,
} from "../../domain/ports/out/calendar-repositories.port.js";
import type { CalendarViewerRole, DocumentDeadline } from "../../domain/services/calendar-items.service.js";

/** D10 — wrapper fino sobre o input port já exposto pelo módulo `locations`. */
export class LocationsCalendarReadAdapter implements CalendarLocationReadPort {
  constructor(private readonly listLocations: ListLocationsPort) {}

  async findAll(organizationId: OrganizationId): Promise<Array<{ id: string; isActive: boolean }>> {
    return (await this.listLocations.execute({ organizationId })).map((l) => ({ id: l.id, isActive: l.isActive }));
  }
}

/**
 * Ticket 05 — prazos derivados dos documentos da Empresa, via o input port
 * do módulo `documents` (que já aplica a visibilidade por papel). Lê sempre
 * só as versões atuais: alterar a validade move o prazo, substituir o
 * documento troca-o pelo da nova versão, e não há nada persistido que possa
 * duplicar num reprocessamento.
 */
export class CompanyDocumentDeadlineReadAdapter implements DocumentDeadlineReadPort {
  constructor(private readonly listCompanyDocuments: ListCompanyDocumentsPort) {}

  async findInRange(organizationId: OrganizationId, from: string, to: string, viewerRole: CalendarViewerRole): Promise<DocumentDeadline[]> {
    const documents = await this.listCompanyDocuments.execute({ organizationId, viewerRole });
    return documents
      .filter((d) => d.isCurrent && d.expiresAt !== null && d.expiresAt >= from && d.expiresAt <= to)
      .map((d) => ({ documentId: d.id, category: d.category, categoryLabel: d.categoryLabel, expiresAt: d.expiresAt! }));
  }
}
