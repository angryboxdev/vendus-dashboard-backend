import { describe, it, expect, beforeEach } from "@jest/globals";
import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import { ReceiveInboundEmailUseCase } from "../../application/use-cases/receive-inbound-email.use-case.js";
import { ProcessInboundAttachmentsUseCase } from "../../application/use-cases/process-inbound-attachments.use-case.js";
import {
  GetEmailIntakeUseCase,
  RotateInboundAddressUseCase,
  SetEmailIntakeDestinationUseCase,
} from "../../application/use-cases/email-intake-settings.use-cases.js";
import { addressAcceptedAt, localPartFromRandomBytes } from "../../domain/entities/inbound-address.js";
import { MAX_ATTEMPTS } from "../../domain/entities/inbound-attachment.js";
import { decideAttachments, looksLikePdf, ourLocalParts } from "../../domain/services/intake-rules.js";
import { EmailIntakeNotAllowedError, EmailIntakeNotConfiguredError } from "../../domain/errors.js";
import type { ReceiveInboundEmailCommand } from "../../domain/ports/in/email-intake.ports.js";
import type { EmailIntakeConfig } from "../../domain/ports/out/email-intake.out-ports.js";
import {
  FakeAddressStore,
  FakeAttachmentRepo,
  FakeEventStore,
  FakeIntake,
  FakeRandom,
  FakeResend,
  FakeSettings,
} from "../fakes/in-memory-intake.js";

// Dados fictícios: empresas, endereços, remetentes e ficheiros inventados.
const ORG_A = mintOrganizationId("org-a");
const ORG_B = mintOrganizationId("org-b");
const DOMAIN = "teste.example.invalid";
const config: EmailIntakeConfig = { configured: true, domain: DOMAIN, allowedOrganizationIds: [] };

function setup(cfg: EmailIntakeConfig = config) {
  const addresses = new FakeAddressStore();
  const events = new FakeEventStore();
  const attachments = new FakeAttachmentRepo();
  const settings = new FakeSettings();
  const resend = new FakeResend();
  const intake = new FakeIntake();
  let now = new Date("2026-10-27T10:00:00Z");
  const clock = () => now;
  const receive = new ReceiveInboundEmailUseCase(events, addresses, settings, attachments, cfg);
  const process = new ProcessInboundAttachmentsUseCase(attachments, resend, intake, clock);
  return {
    addresses, events, attachments, settings, resend, intake, receive, process,
    advance(minutes: number) {
      now = new Date(now.getTime() + minutes * 60_000);
    },
  };
}

const pdf = (id: string, filename = `${id}.pdf`) => ({ id, filename, contentType: "application/pdf", size: 1000, contentDisposition: "attachment" });

function email(over: Partial<ReceiveInboundEmailCommand> = {}): ReceiveInboundEmailCommand {
  return {
    webhookId: "msg_1",
    type: "email.received",
    emailId: "email-1",
    receivedAt: new Date("2026-10-27T09:59:00Z"),
    from: "faturacao@fornecedor.example.invalid",
    recipients: [`abcdefghjkmnpqrs@${DOMAIN}`],
    attachments: [pdf("a1", "FT 2026-1.pdf")],
    ...over,
  };
}

describe("Faturas por email — receção (webhook)", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
    s.addresses.seed(ORG_A, "abcdefghjkmnpqrs");
  });

  it("1. um PDF válido → registado na empresa do destinatário e importado como rascunho (Faturas)", async () => {
    const r = await s.receive.execute(email());
    expect(r).toEqual({ status: "accepted", organizationId: ORG_A, acceptedAttachments: 1 });
    s.resend.addEmail("email-1", [{ id: "a1", filename: "FT 2026-1.pdf" }]);
    const p = await s.process.execute({ organizationId: ORG_A });
    expect(p).toMatchObject({ processed: 1, imported: 1 });
    expect(s.intake.calls).toEqual([{ organizationId: ORG_A, filename: "FT 2026-1.pdf", destination: "finance" }]);
    expect(s.attachments.byOrg(ORG_A)[0]).toMatchObject({ status: "imported", invoiceId: "inv-1", sender: "faturacao@fornecedor.example.invalid" });
  });

  it("2. vários PDFs no mesmo email → um registo e uma importação por PDF", async () => {
    await s.receive.execute(email({ attachments: [pdf("a1"), pdf("a2"), pdf("a3")] }));
    s.resend.addEmail("email-1", [{ id: "a1", filename: "a1.pdf" }, { id: "a2", filename: "a2.pdf" }, { id: "a3", filename: "a3.pdf" }]);
    const p = await s.process.execute({ organizationId: ORG_A });
    expect(p.imported).toBe(3);
    expect(s.intake.calls.map((c) => c.filename)).toEqual(["a1.pdf", "a2.pdf", "a3.pdf"]);
  });

  it("3. o mesmo webhook duas vezes → a segunda é ignorada (sem registos nem importações a mais)", async () => {
    await s.receive.execute(email());
    expect(await s.receive.execute(email())).toEqual({ status: "duplicate" });
    // Outra entrega (outro svix-id) do mesmo email: também repetida.
    expect(await s.receive.execute(email({ webhookId: "msg_2" }))).toEqual({ status: "duplicate" });
    expect(s.attachments.rows).toHaveLength(1);
  });

  it("3b. evento que ficou a meio (servidor caiu) → a repetição da Resend retoma-o sem duplicar", async () => {
    await s.events.record({ webhookId: "msg_1", emailId: "email-1", receivedAt: new Date() }); // ficou «received»
    const r = await s.receive.execute(email());
    expect(r.status).toBe("accepted");
    expect(s.attachments.rows).toHaveLength(1);
  });

  it("5. email sem PDF válido → aceite sem anexos; imagens (assinatura, logótipo) nem ficam no histórico", async () => {
    const r = await s.receive.execute(
      email({ attachments: [{ id: "i1", filename: "logo.png", contentType: "image/png", size: 2000, contentDisposition: "inline" }] }),
    );
    expect(r).toEqual({ status: "accepted", organizationId: ORG_A, acceptedAttachments: 0 });
    expect(s.attachments.rows).toHaveLength(0);
    expect(s.events.events[0]).toMatchObject({ status: "accepted", reason: "no_valid_pdf" });
  });

  it("6. endereço desconhecido → quarentena, nada importado", async () => {
    const r = await s.receive.execute(email({ recipients: [`naoexiste000000x@${DOMAIN}`] }));
    expect(r).toEqual({ status: "quarantined", reason: "unknown_address" });
    expect(s.attachments.rows).toHaveLength(0);
  });

  it("6b. o remetente nunca decide a empresa (só o destinatário do nosso domínio)", async () => {
    const r = await s.receive.execute(email({ recipients: ["abcdefghjkmnpqrs@outro-dominio.example.invalid"] }));
    expect(r).toEqual({ status: "quarantined", reason: "unknown_address" });
  });

  it("7. endereço desativado → quarentena para emails recebidos depois da desativação", async () => {
    s.addresses.rows[0]!.status = "inactive";
    s.addresses.rows[0]!.deactivatedAt = new Date("2026-10-27T09:00:00Z");
    const r = await s.receive.execute(email({ receivedAt: new Date("2026-10-27T09:30:00Z") }));
    expect(r).toEqual({ status: "quarantined", reason: "inactive_address" });
  });

  it("15. evento atrasado: recebido ANTES da rotação ainda entra pelo endereço antigo", async () => {
    s.addresses.rows[0]!.status = "inactive";
    s.addresses.rows[0]!.deactivatedAt = new Date("2026-10-27T09:00:00Z");
    const r = await s.receive.execute(email({ receivedAt: new Date("2026-10-27T08:59:00Z") }));
    expect(r).toMatchObject({ status: "accepted", organizationId: ORG_A });
  });

  it("12. duas empresas ao mesmo tempo → cada email fica na sua empresa", async () => {
    s.addresses.seed(ORG_B, "bbbbbbbbbbbbbbbb");
    const [ra, rb] = await Promise.all([
      s.receive.execute(email()),
      s.receive.execute(email({ webhookId: "msg_b", emailId: "email-b", recipients: [`Faturas <bbbbbbbbbbbbbbbb@${DOMAIN}>`] })),
    ]);
    expect(ra).toMatchObject({ organizationId: ORG_A });
    expect(rb).toMatchObject({ organizationId: ORG_B });
    expect(s.attachments.byOrg(ORG_A)).toHaveLength(1);
    expect(s.attachments.byOrg(ORG_B)).toHaveLength(1);
  });

  it("endereços de duas empresas no mesmo email → quarentena (nunca mistura dados)", async () => {
    s.addresses.seed(ORG_B, "bbbbbbbbbbbbbbbb");
    const r = await s.receive.execute(email({ recipients: [`abcdefghjkmnpqrs@${DOMAIN}`, `bbbbbbbbbbbbbbbb@${DOMAIN}`] }));
    expect(r).toEqual({ status: "quarantined", reason: "ambiguous_recipients" });
  });

  it("destino Stock (cliente só de Stock) → importa para Compras por rever", async () => {
    s.settings.destinations.set(ORG_A, "stock");
    await s.receive.execute(email());
    s.resend.addEmail("email-1", [{ id: "a1", filename: "FT 2026-1.pdf" }]);
    await s.process.execute({ organizationId: ORG_A });
    expect(s.intake.calls[0]!.destination).toBe("stock");
  });

  it("outros eventos (não email.received) são ignorados", async () => {
    expect(await s.receive.execute(email({ type: "email.sent" }))).toEqual({ status: "ignored", reason: "event_type" });
    expect(s.events.events).toHaveLength(0);
  });
});

describe("Faturas por email — processamento", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(async () => {
    s = setup();
    s.addresses.seed(ORG_A, "abcdefghjkmnpqrs");
  });

  it("10. falha temporária da Resend → erro com nova tentativa; depois recupera sem duplicar", async () => {
    await s.receive.execute(email());
    s.resend.addEmail("email-1", [{ id: "a1", filename: "FT 2026-1.pdf" }]);
    s.resend.failListTimes = 1;
    expect((await s.process.execute({ organizationId: ORG_A })).failed).toBe(1);
    expect(s.attachments.rows[0]).toMatchObject({ status: "read_error", attempts: 1 });
    expect(s.attachments.rows[0]!.nextAttemptAt).not.toBeNull();

    // Antes da hora da nova tentativa não volta a tentar.
    expect((await s.process.execute({ organizationId: ORG_A })).processed).toBe(0);
    s.advance(6);
    expect((await s.process.execute({ organizationId: ORG_A })).imported).toBe(1);
    expect(s.intake.calls).toHaveLength(1);
    // Concluído: nunca mais é processado.
    s.advance(60);
    expect((await s.process.execute({ organizationId: ORG_A })).processed).toBe(0);
  });

  it("10b. esgotadas as tentativas → «Erro de leitura» final", async () => {
    await s.receive.execute(email());
    s.resend.failListTimes = 99;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await s.process.execute({ organizationId: ORG_A });
      s.advance(200);
    }
    expect(s.attachments.rows[0]).toMatchObject({ status: "read_error", attempts: MAX_ATTEMPTS, nextAttemptAt: null });
    expect((await s.process.execute({ organizationId: ORG_A })).processed).toBe(0);
  });

  it("11. ficheiro que não é PDF de verdade, ou que o leitor recusa → rejeitado com motivo", async () => {
    await s.receive.execute(email({ attachments: [pdf("a1", "falso.pdf"), pdf("a2", "nao-fatura.pdf")] }));
    s.resend.addEmail("email-1", [
      { id: "a1", filename: "falso.pdf", bytes: Buffer.from("<html>não é pdf</html>") },
      { id: "a2", filename: "nao-fatura.pdf" },
    ]);
    s.intake.outcomes.set("nao-fatura.pdf", { outcome: "rejected", code: "not_invoice", message: "Não é uma fatura." });
    await s.process.execute({ organizationId: ORG_A });
    expect(s.attachments.rows.map((r) => [r.filename, r.status, r.errorCode])).toEqual([
      ["falso.pdf", "rejected", "not_pdf_content"],
      ["nao-fatura.pdf", "rejected", "not_invoice"],
    ]);
    expect(s.intake.calls.map((c) => c.filename)).toEqual(["nao-fatura.pdf"]);
  });

  it("4. fatura já importada à mão → «Duplicado», nada é criado", async () => {
    await s.receive.execute(email());
    s.resend.addEmail("email-1", [{ id: "a1", filename: "FT 2026-1.pdf" }]);
    s.intake.outcomes.set("FT 2026-1.pdf", { outcome: "duplicate", invoiceId: "inv-manual", message: "O mesmo ficheiro já tinha sido importado." });
    expect((await s.process.execute({ organizationId: ORG_A })).duplicates).toBe(1);
    expect(s.attachments.rows[0]).toMatchObject({ status: "duplicate", invoiceId: "inv-manual" });
  });

  it("16. falha parcial com vários PDFs → só o que falhou é tentado de novo", async () => {
    await s.receive.execute(email({ attachments: [pdf("a1"), pdf("a2")] }));
    s.resend.addEmail("email-1", [{ id: "a1", filename: "a1.pdf" }, { id: "a2", filename: "a2.pdf" }]);
    s.intake.outcomes.set("a2.pdf", new Error("Leitor indisponível"));
    await s.process.execute({ organizationId: ORG_A });
    expect(s.attachments.rows.map((r) => r.status)).toEqual(["imported", "read_error"]);

    s.intake.outcomes.delete("a2.pdf");
    s.advance(6);
    await s.process.execute({ organizationId: ORG_A });
    expect(s.attachments.rows.map((r) => r.status)).toEqual(["imported", "imported"]);
    expect(s.intake.calls.map((c) => c.filename)).toEqual(["a1.pdf", "a2.pdf", "a2.pdf"]);
  });

  it("dois processamentos ao mesmo tempo nunca tratam o mesmo anexo", async () => {
    await s.receive.execute(email());
    s.resend.addEmail("email-1", [{ id: "a1", filename: "FT 2026-1.pdf" }]);
    const [p1, p2] = await Promise.all([s.process.execute({ organizationId: ORG_A }), s.process.execute({ organizationId: ORG_A })]);
    expect(p1.processed + p2.processed).toBe(1);
    expect(s.intake.calls).toHaveLength(1);
  });

  it("orçamento da IA esgotado → tenta mais tarde (não perde o anexo)", async () => {
    await s.receive.execute(email());
    s.resend.addEmail("email-1", [{ id: "a1", filename: "FT 2026-1.pdf" }]);
    s.intake.outcomes.set("FT 2026-1.pdf", { outcome: "retry_later", message: "Limite diário da IA atingido." });
    await s.process.execute({ organizationId: ORG_A });
    expect(s.attachments.rows[0]).toMatchObject({ status: "read_error", errorMessage: "Limite diário da IA atingido." });
    expect(s.attachments.rows[0]!.nextAttemptAt).not.toBeNull();
  });

  it("anexo que já não existe na Resend → rejeitado (não fica a tentar para sempre)", async () => {
    await s.receive.execute(email());
    s.resend.addEmail("email-1", []);
    await s.process.execute({ organizationId: ORG_A });
    expect(s.attachments.rows[0]).toMatchObject({ status: "rejected", errorCode: "attachment_missing" });
  });
});

describe("Faturas por email — endereço e ecrã", () => {
  it("8. gerar novo endereço: o anterior fica inativo (histórico) e deixa de ser aceite", async () => {
    const addresses = new FakeAddressStore();
    const rotate = new RotateInboundAddressUseCase(addresses, new FakeRandom(), config);
    const first = await rotate.execute({ organizationId: ORG_A, actor: "gestor@teste.invalid", reason: null });
    const second = await rotate.execute({ organizationId: ORG_A, actor: "gestor@teste.invalid", reason: "Fornecedor errado recebeu o endereço" });
    expect(first.email).not.toBe(second.email);
    expect(second.email.endsWith(`@${DOMAIN}`)).toBe(true);
    const all = await addresses.listAll(ORG_A);
    expect(all.filter((a) => a.status === "active")).toHaveLength(1);
    expect(all.find((a) => a.status === "inactive")).toMatchObject({ deactivatedBy: "gestor@teste.invalid", deactivationReason: "Fornecedor errado recebeu o endereço" });
  });

  it("8b. colisão do identificador → tenta outro", async () => {
    const addresses = new FakeAddressStore();
    const random = new FakeRandom();
    addresses.seed(ORG_B, localPartFromRandomBytes(new FakeRandom().bytes(16)));
    const r = await new RotateInboundAddressUseCase(addresses, random, config).execute({ organizationId: ORG_A, actor: "x", reason: null });
    expect(r.email).toContain(`@${DOMAIN}`);
  });

  it("sem configuração no servidor, ou empresa fora do piloto → não gera endereço", async () => {
    const addresses = new FakeAddressStore();
    await expect(
      new RotateInboundAddressUseCase(addresses, new FakeRandom(), { configured: false, domain: null, allowedOrganizationIds: [] }).execute({ organizationId: ORG_A, actor: "x", reason: null }),
    ).rejects.toThrow(EmailIntakeNotConfiguredError);
    await expect(
      new RotateInboundAddressUseCase(addresses, new FakeRandom(), { ...config, allowedOrganizationIds: [ORG_B] }).execute({ organizationId: ORG_A, actor: "x", reason: null }),
    ).rejects.toThrow(EmailIntakeNotAllowedError);
  });

  it("17. o ecrã só mostra o endereço e o histórico da própria empresa", async () => {
    const s = setup();
    s.addresses.seed(ORG_A, "abcdefghjkmnpqrs");
    s.addresses.seed(ORG_B, "bbbbbbbbbbbbbbbb");
    await s.receive.execute(email({ webhookId: "m-b", emailId: "e-b", recipients: [`bbbbbbbbbbbbbbbb@${DOMAIN}`] }));
    const get = new GetEmailIntakeUseCase(s.addresses, s.attachments, s.events, s.settings, config, () => new Date("2026-10-27T12:00:00Z"));
    const a = await get.execute({ organizationId: ORG_A });
    expect(a.address?.email).toBe(`abcdefghjkmnpqrs@${DOMAIN}`);
    expect(a.recent).toHaveLength(0);
    const b = await get.execute({ organizationId: ORG_B });
    expect(b.recent).toHaveLength(1);
    expect(b.counts.pending).toBe(1);
  });

  it("destino por empresa: Faturas por defeito, Stock quando escolhido", async () => {
    const settings = new FakeSettings();
    expect(await settings.getDestination(ORG_A)).toBe("finance");
    await new SetEmailIntakeDestinationUseCase(settings).execute({ organizationId: ORG_A, destination: "stock", actor: "x" });
    expect(await settings.getDestination(ORG_A)).toBe("stock");
  });
});

describe("Faturas por email — regras puras", () => {
  it("destinatários: formato «Nome <a@b>», maiúsculas, «+etiqueta» e outros domínios", () => {
    expect(ourLocalParts([`Faturas <ABCdef+loja1@${DOMAIN.toUpperCase()}>`, "x@outro.example.invalid", `abcdef@${DOMAIN}`], DOMAIN)).toEqual(["abcdef"]);
  });

  it("anexos: só PDFs anexados, até 20 MB e 10 por email", () => {
    const d = decideAttachments([
      pdf("1"),
      { id: "2", filename: "foto.jpg", contentType: "image/jpeg", size: 10, contentDisposition: "attachment" },
      { id: "3", filename: "grande.pdf", contentType: "application/pdf", size: 30 * 1024 * 1024, contentDisposition: "attachment" },
      { id: "4", filename: "embutido.pdf", contentType: "application/pdf", size: 10, contentDisposition: "inline" },
      ...Array.from({ length: 11 }, (_, i) => pdf(`m${i}`)),
    ]);
    expect(d.filter((x) => x.decision.accept)).toHaveLength(10);
    expect(d.map((x) => (x.decision.accept ? "ok" : x.decision.code)).slice(0, 4)).toEqual(["ok", "not_pdf", "too_large", "inline"]);
    expect(d.at(-1)!.decision).toMatchObject({ accept: false, code: "too_many" });
  });

  it("conteúdo real de PDF e identificador aleatório (16 caracteres, sem ambíguos)", () => {
    expect(looksLikePdf(Buffer.from("%PDF-1.4"))).toBe(true);
    expect(looksLikePdf(Buffer.from("MZ executável"))).toBe(false);
    const l = localPartFromRandomBytes(Uint8Array.from({ length: 16 }, (_, i) => i * 17));
    expect(l).toMatch(/^[a-z2-9]{16}$/);
    expect(l).not.toMatch(/[01ilo]/);
  });

  it("janela de aceitação do endereço", () => {
    const a = { createdAt: new Date("2026-10-01T00:00:00Z"), deactivatedAt: new Date("2026-10-20T00:00:00Z") };
    expect(addressAcceptedAt(a, new Date("2026-10-10T00:00:00Z"))).toBe(true);
    expect(addressAcceptedAt(a, new Date("2026-10-21T00:00:00Z"))).toBe(false);
    expect(addressAcceptedAt(a, new Date("2026-09-30T00:00:00Z"))).toBe(false);
  });
});
