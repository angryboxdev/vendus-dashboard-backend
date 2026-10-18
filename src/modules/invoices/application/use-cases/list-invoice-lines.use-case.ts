import type { ListInvoiceLinesPort, InvoiceLineDTO } from "../../domain/ports/in/invoice.ports.js";
import type { InvoiceLineRepositoryPort } from "../../domain/ports/out/invoice-line-repository.port.js";
import type { InvoiceRepositoryPort } from "../../domain/ports/out/invoice-repository.port.js";
import { toInvoiceLineDTO } from "./shared.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";

/**
 * Feed de análise (IVA da Contabilidade, Centros de Custo): só linhas de
 * faturas «Por artigo». Desde a F2 as linhas reais do documento ficam
 * guardadas em todos os modos — sem este filtro, «Única»/«Por valores»
 * passariam a contar duas vezes (cabeçalho/repartições + linhas).
 */
export class ListInvoiceLinesUseCase implements ListInvoiceLinesPort {
  constructor(
    private readonly lineRepo: InvoiceLineRepositoryPort,
    private readonly invoiceRepo: Pick<InvoiceRepositoryPort, "findIdsByLineDetailMode">,
  ) {}

  async execute(organizationId: OrganizationId): Promise<InvoiceLineDTO[]> {
    const [lines, notItemized] = await Promise.all([
      this.lineRepo.findAll(organizationId),
      this.invoiceRepo.findIdsByLineDetailMode(organizationId, ["simple", "by_values"]),
    ]);
    return lines.filter((l) => !notItemized.has(l.invoiceId)).map(toInvoiceLineDTO);
  }
}
