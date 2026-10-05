import { randomUUID } from "crypto";
import { isValidDocumentPeriod } from "../../../documents/domain/entities/document.js";
import type { DocumentRepositoryPort as EmployeeDocumentRepositoryPort } from "../../../documents/domain/ports/out/document-repository.port.js";
import type { DocumentCategoryRepositoryPort } from "../../../documents/domain/ports/out/document-category-repository.port.js";
import { DocumentPeriodAlreadyExistsError, InvalidDocumentError } from "../../domain/errors.js";
import type { EmployeeRepositoryPort } from "../../domain/ports/out/employee-repository.port.js";
import type { PdfTextExtractorPort } from "../../domain/ports/out/pdf-text-extractor.port.js";
import type { ReplaceEmployeeDocumentPort, UploadEmployeeDocumentPort } from "../../domain/ports/in/employee-document.ports.js";
import {
  type ImportPayslipsCommand,
  type ImportPayslipsPort,
  type PayslipImportResultDTO,
  type PayslipPreviewRowDTO,
  type PreviewPayslipImportCommand,
  type PreviewPayslipImportPort,
} from "../../domain/ports/in/payslip-import.ports.js";
import type { OrganizationId } from "../../../../kernel/organization-id.js";
import { identifyPayslipEmployee } from "../../domain/services/payslip-identification.service.js";

function assertPeriod(period: string): void {
  if (!isValidDocumentPeriod(period)) throw new InvalidDocumentError("Período inválido (Mês/Ano)");
}

function assertUniqueFileNames(fileNames: string[]): void {
  if (new Set(fileNames).size !== fileNames.length) throw new InvalidDocumentError("Há ficheiros com o mesmo nome no lote");
}

async function assertPayslipCategory(categories: DocumentCategoryRepositoryPort, organizationId: OrganizationId, slug: string): Promise<void> {
  const definition = await categories.findBySlug(organizationId, slug);
  if (!definition || !definition.active || !definition.requiresPeriod) {
    throw new InvalidDocumentError(`A categoria "${definition?.label ?? slug}" não está ativa nesta organização`);
  }
}

/**
 * Importação em massa de recibos — passo 1 (Base Organizacional, ticket 10,
 * task §24–26): identifica o colaborador de cada PDF e assinala recibos já
 * existentes no período. Não grava nada.
 */
export class PreviewPayslipImportUseCase implements PreviewPayslipImportPort {
  constructor(
    private readonly employeeRepository: EmployeeRepositoryPort,
    private readonly employeeDocumentRepository: EmployeeDocumentRepositoryPort,
    private readonly documentCategoryRepository: DocumentCategoryRepositoryPort,
    private readonly pdfTextExtractor: PdfTextExtractorPort,
  ) {}

  async execute(command: PreviewPayslipImportCommand): Promise<PayslipPreviewRowDTO[]> {
    assertPeriod(command.period);
    assertUniqueFileNames(command.files.map((f) => f.fileName));
    await assertPayslipCategory(this.documentCategoryRepository, command.organizationId, command.category);

    // Inclui inativos: quem saiu durante o mês ainda recebe o último recibo.
    const employees = await this.employeeRepository.findMany(command.organizationId, { status: "all" });
    const nameById = new Map(employees.map((e) => [e.id, e.fullName]));
    const current = await this.employeeDocumentRepository.findCurrentByOwners(command.organizationId, "employee", employees.map((e) => e.id));
    const existingByEmployee = new Map(
      current.filter((d) => d.category === command.category && d.period === command.period).map((d) => [d.ownerId, d.id]),
    );
    const candidates = employees.map((e) => ({ id: e.id, fullName: e.fullName, nif: e.nif }));

    const rows: PayslipPreviewRowDTO[] = [];
    for (const file of command.files) {
      const text = await this.pdfTextExtractor.extractText(file.buffer);
      const match = identifyPayslipEmployee({ fileName: file.fileName, text }, candidates);
      const base = { fileName: file.fileName, period: command.period, hasText: text !== null };
      if (match.status === "review") {
        rows.push({
          ...base,
          status: "review",
          employeeId: null,
          employeeName: null,
          matchReason: null,
          reviewReason: match.reason,
          candidates: match.candidateIds.map((id) => ({ id, name: nameById.get(id) ?? "" })),
          existingDocumentId: null,
        });
        continue;
      }
      const existingDocumentId = existingByEmployee.get(match.employeeId) ?? null;
      rows.push({
        ...base,
        status: existingDocumentId ? "duplicate" : "identified",
        employeeId: match.employeeId,
        employeeName: nameById.get(match.employeeId) ?? null,
        matchReason: match.reason,
        reviewReason: null,
        candidates: [],
        existingDocumentId,
      });
    }

    // Dois ficheiros do lote para o mesmo colaborador: nenhum é associado automaticamente.
    const countByEmployee = new Map<string, number>();
    for (const r of rows) if (r.employeeId) countByEmployee.set(r.employeeId, (countByEmployee.get(r.employeeId) ?? 0) + 1);
    return rows.map((r) =>
      r.employeeId && countByEmployee.get(r.employeeId)! > 1
        ? {
            ...r,
            status: "review" as const,
            reviewReason: "repeated_in_batch" as const,
            candidates: [{ id: r.employeeId, name: r.employeeName ?? "" }],
            employeeId: null,
            employeeName: null,
            matchReason: null,
            existingDocumentId: null,
          }
        : r,
    );
  }
}

/**
 * Importação em massa de recibos — passo 2: grava o que o utilizador
 * confirmou na pré-visualização. Cada recibo passa pelos mesmos use cases do
 * upload individual (mesmas regras, mesmo histórico de alterações — §27);
 * o lote partilha um `correlationId`. Um recibo já existente no período sem
 * "Substituir versão" nunca é duplicado — devolve `duplicate`.
 */
export class ImportPayslipsUseCase implements ImportPayslipsPort {
  constructor(
    private readonly employeeDocumentRepository: EmployeeDocumentRepositoryPort,
    private readonly documentCategoryRepository: DocumentCategoryRepositoryPort,
    private readonly uploadEmployeeDocument: UploadEmployeeDocumentPort,
    private readonly replaceEmployeeDocument: ReplaceEmployeeDocumentPort,
  ) {}

  async execute(command: ImportPayslipsCommand): Promise<PayslipImportResultDTO[]> {
    assertPeriod(command.period);
    assertUniqueFileNames(command.items.map((i) => i.fileName));
    if (new Set(command.items.map((i) => i.employeeId)).size !== command.items.length) {
      throw new InvalidDocumentError("Cada colaborador só pode receber um recibo por período");
    }
    await assertPayslipCategory(this.documentCategoryRepository, command.organizationId, command.category);

    const importBatchId = randomUUID();
    const results: PayslipImportResultDTO[] = [];
    for (const item of command.items) {
      const base = { fileName: item.fileName, employeeId: item.employeeId };
      try {
        if (item.action === "replace") {
          const current = await this.employeeDocumentRepository.findCurrentByOwners(command.organizationId, "employee", [item.employeeId]);
          const existing = current.find((d) => d.category === command.category && d.period === command.period);
          if (!existing) {
            results.push({ ...base, outcome: "failed", documentId: null, message: "Não existe recibo deste colaborador para este período" });
            continue;
          }
          const saved = await this.replaceEmployeeDocument.execute({
            organizationId: command.organizationId,
            actor: command.actor,
            employeeId: item.employeeId,
            documentId: existing.id,
            buffer: item.buffer,
            filename: item.fileName,
            mimeType: item.mimeType,
            importBatchId,
          });
          results.push({ ...base, outcome: "replaced", documentId: saved.id, message: null });
          continue;
        }
        const saved = await this.uploadEmployeeDocument.execute({
          organizationId: command.organizationId,
          actor: command.actor,
          employeeId: item.employeeId,
          category: command.category,
          mandatory: false,
          origin: "rh",
          expiresAt: null,
          period: command.period,
          buffer: item.buffer,
          filename: item.fileName,
          mimeType: item.mimeType,
          importBatchId,
        });
        results.push({ ...base, outcome: "created", documentId: saved.id, message: null });
      } catch (e) {
        if (e instanceof DocumentPeriodAlreadyExistsError) {
          results.push({ ...base, outcome: "duplicate", documentId: e.existingDocumentId, message: "Já existe um recibo deste colaborador para este período." });
          continue;
        }
        results.push({ ...base, outcome: "failed", documentId: null, message: e instanceof Error ? e.message : "Erro desconhecido" });
      }
    }
    return results;
  }
}
