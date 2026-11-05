import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { GetOrganizationProfileUseCase } from "../../application/use-cases/get-organization-profile.use-case.js";
import { UpdateOrganizationProfileUseCase } from "../../application/use-cases/update-organization-profile.use-case.js";
import { UploadOrganizationLogoUseCase } from "../../application/use-cases/upload-organization-logo.use-case.js";
import { ListOrganizationHistoryUseCase } from "../../application/use-cases/list-organization-history.use-case.js";
import { InvalidOrganizationProfileError, OrganizationNotFoundError } from "../../domain/errors.js";
import {
  FakeOrganizationAuditLog,
  FakeOrganizationFileStorage,
  FakeOrganizationProfileRepository,
  profileProps,
} from "../fakes/fakes.js";

const ORG = mintOrganizationId("org-test");
const OTHER_ORG = mintOrganizationId("org-other");
const NOW = () => new Date("2026-10-04T10:00:00.000Z");

function setup() {
  const repository = new FakeOrganizationProfileRepository();
  const storage = new FakeOrganizationFileStorage();
  const auditLog = new FakeOrganizationAuditLog();
  repository.seed(profileProps({ id: ORG }));
  return { repository, storage, auditLog };
}

describe("GetOrganizationProfileUseCase", () => {
  it("devolve o perfil com URL assinado do logotipo, nunca o caminho interno", async () => {
    const { repository, storage } = setup();
    repository.seed(profileProps({ id: ORG, logoStoragePath: `${ORG}/logo/1/logo.png` }));

    const dto = await new GetOrganizationProfileUseCase(repository, storage).execute({ organizationId: ORG });

    expect(dto.logoUrl).toBe(`https://signed.test/${ORG}/logo/1/logo.png`);
    expect(dto).not.toHaveProperty("logoStoragePath");
  });

  it("organização de outro tenant não é encontrada", async () => {
    const { repository, storage } = setup();
    await expect(new GetOrganizationProfileUseCase(repository, storage).execute({ organizationId: OTHER_ORG })).rejects.toBeInstanceOf(
      OrganizationNotFoundError,
    );
  });
});

describe("UpdateOrganizationProfileUseCase", () => {
  it("grava as alterações e audita antes/depois", async () => {
    const { repository, storage, auditLog } = setup();
    const useCase = new UpdateOrganizationProfileUseCase(repository, storage, auditLog, NOW);

    const dto = await useCase.execute({
      organizationId: ORG,
      actor: "admin@exemplo.pt",
      changes: { legalName: "Exemplo Restauração, Lda", city: "Porto" },
    });

    expect(dto.legalName).toBe("Exemplo Restauração, Lda");
    expect((await repository.findById(ORG))?.toProps().city).toBe("Porto");
    expect(auditLog.entries).toHaveLength(1);
    expect(auditLog.entries[0]).toMatchObject({ action: "update", actor: "admin@exemplo.pt", entityId: ORG });
    expect((auditLog.entries[0]?.before as { legalName: string | null }).legalName).toBeNull();
  });

  it("dados inválidos não gravam nem auditam nada", async () => {
    const { repository, storage, auditLog } = setup();
    const useCase = new UpdateOrganizationProfileUseCase(repository, storage, auditLog, NOW);

    await expect(
      useCase.execute({ organizationId: ORG, actor: "admin@exemplo.pt", changes: { legalName: "X, Lda", nif: "111111111" } }),
    ).rejects.toBeInstanceOf(InvalidOrganizationProfileError);

    expect((await repository.findById(ORG))?.toProps().legalName).toBeNull();
    expect(auditLog.entries).toHaveLength(0);
  });
});

describe("UploadOrganizationLogoUseCase", () => {
  it("guarda o novo logotipo sem apagar o anterior e audita a troca", async () => {
    const { repository, storage, auditLog } = setup();
    repository.seed(profileProps({ id: ORG, logoStoragePath: "antigo/logo.png" }));
    const useCase = new UploadOrganizationLogoUseCase(repository, storage, auditLog, NOW);

    const dto = await useCase.execute({
      organizationId: ORG,
      actor: "admin@exemplo.pt",
      buffer: Buffer.from("png"),
      filename: "logo.png",
      mimeType: "image/png",
    });

    expect(storage.stored).toHaveLength(1);
    expect(dto.logoUrl).toBe(`https://signed.test/${storage.stored[0]?.path}`);
    expect(auditLog.entries[0]).toMatchObject({
      action: "logo_update",
      before: { logoStoragePath: "antigo/logo.png" },
      after: { logoStoragePath: storage.stored[0]?.path },
    });
  });
});

describe("ListOrganizationHistoryUseCase", () => {
  it("lista só as entradas da própria organização", async () => {
    const { repository, storage, auditLog } = setup();
    await new UpdateOrganizationProfileUseCase(repository, storage, auditLog, NOW).execute({
      organizationId: ORG,
      actor: "admin@exemplo.pt",
      changes: { legalName: "Exemplo, Lda" },
    });
    await auditLog.record({ organizationId: OTHER_ORG, actor: "x", entityType: "organization", entityId: OTHER_ORG, action: "update" });

    const history = await new ListOrganizationHistoryUseCase(auditLog).execute({ organizationId: ORG });

    expect(history).toHaveLength(1);
    expect(history[0]?.entityId).toBe(ORG);
  });
});

describe("Empresa → emitente das faturas", () => {
  const complete = { legalName: "Exemplo Restauração, Lda", niss: "12345678901", email: "geral@exemplo.invalid", postalCode: "4000-001", city: "Porto", region: "Porto", phone: "+351 220 000 000" };

  it("com dados em falta grava a Empresa e diz o que falta, sem tocar no emitente", async () => {
    const { repository, storage, auditLog } = setup();
    const sync = { calls: [] as unknown[], sync: async (...a: unknown[]) => void sync.calls.push(a) };
    const dto = await new UpdateOrganizationProfileUseCase(repository, storage, auditLog, NOW, sync).execute({ organizationId: ORG, actor: "admin@exemplo.pt", changes: { legalName: "Exemplo Restauração, Lda" } });
    expect(dto.issuerSync).toEqual({ status: "incomplete", missing: ["niss", "email", "postalCode", "city", "region"] });
    expect(sync.calls).toHaveLength(0);
    expect((await repository.findById(ORG))?.toProps().legalName).toBe("Exemplo Restauração, Lda");
  });

  it("completa: envia a razão social, o NIF e a morada; telefone só no formato internacional", async () => {
    const { repository, storage, auditLog } = setup();
    const sync = { calls: [] as unknown[][], sync: async (...a: unknown[]) => void sync.calls.push(a) };
    const dto = await new UpdateOrganizationProfileUseCase(repository, storage, auditLog, NOW, sync).execute({ organizationId: ORG, actor: "admin@exemplo.pt", changes: complete });
    expect(dto.issuerSync).toEqual({ status: "synced" });
    expect(sync.calls[0]).toEqual([ORG, "admin@exemplo.pt", { legalName: "Exemplo Restauração, Lda", country: "PT", nif: "123456789", niss: "12345678901", email: "geral@exemplo.invalid", street: "Rua de Teste, 1", postalCode: "4000-001", city: "Porto", region: "Porto", phone: "+351220000000" }]);
  });

  it("se o emitente falhar, a Empresa fica gravada e o erro volta na resposta", async () => {
    const { repository, storage, auditLog } = setup();
    const sync = { sync: async () => { throw new Error("NISS inválido"); } };
    const dto = await new UpdateOrganizationProfileUseCase(repository, storage, auditLog, NOW, sync).execute({ organizationId: ORG, actor: "admin@exemplo.pt", changes: complete });
    expect(dto.issuerSync).toEqual({ status: "failed", message: "NISS inválido" });
    expect((await repository.findById(ORG))?.toProps().region).toBe("Porto");
  });
});
