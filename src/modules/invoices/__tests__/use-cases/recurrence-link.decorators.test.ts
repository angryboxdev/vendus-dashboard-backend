import { mintOrganizationId } from "../../../../kernel/organization-id.js";
import {
  ConfirmImportedInvoiceWithRecurrenceLink,
  CreateInvoiceWithRecurrenceLink,
  DeleteInvoiceWithRecurrenceRelease,
} from "../../application/use-cases/recurrence-link.decorators.js";
import type {
  ConfirmImportedInvoiceCommand,
  CreateInvoiceCommand,
  InvoiceDTO,
} from "../../domain/ports/in/invoice.ports.js";
import type { RecurrenceLinkPort } from "../../domain/ports/out/recurrence-link.port.js";

const organizationId = mintOrganizationId("org-a");
const dto = { id: "inv-1" } as InvoiceDTO;

function links(fail = false) {
  const calls: string[] = [];
  const port: RecurrenceLinkPort = {
    async autoLinkInvoice(_org, id) {
      calls.push(`link:${id}`);
      if (fail) throw new Error("falha simulada");
    },
    async releaseInvoice(_org, id, group) {
      calls.push(`release:${id}:${group}`);
      if (fail) throw new Error("falha simulada");
    },
  };
  return { port, calls };
}

describe("Faturas → associação à recorrência", () => {
  let errorSpy: jest.SpyInstance;
  beforeEach(() => { errorSpy = jest.spyOn(console, "error").mockImplementation(() => {}); });
  afterEach(() => errorSpy.mockRestore());

  it("depois de criar ou confirmar, pede a associação automática", async () => {
    const { port, calls } = links();
    const create = new CreateInvoiceWithRecurrenceLink({ execute: async () => dto }, port);
    const confirm = new ConfirmImportedInvoiceWithRecurrenceLink({ execute: async () => dto }, port);
    await create.execute({ organizationId } as CreateInvoiceCommand);
    await confirm.execute({ organizationId } as ConfirmImportedInvoiceCommand);
    expect(calls).toEqual(["link:inv-1", "link:inv-1"]);
  });

  it("uma falha na associação não impede o lançamento", async () => {
    const { port } = links(true);
    const create = new CreateInvoiceWithRecurrenceLink({ execute: async () => dto }, port);
    await expect(create.execute({ organizationId } as CreateInvoiceCommand)).resolves.toBe(dto);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("se a criação falha, não tenta associar", async () => {
    const { port, calls } = links();
    const create = new CreateInvoiceWithRecurrenceLink({ execute: async () => { throw new Error("duplicada"); } }, port);
    await expect(create.execute({ organizationId } as CreateInvoiceCommand)).rejects.toThrow("duplicada");
    expect(calls).toEqual([]);
  });

  it("depois de apagar, liberta as ocorrências; uma falha aí não falha o apagar", async () => {
    const ok = links();
    await new DeleteInvoiceWithRecurrenceRelease({ execute: async () => {} }, ok.port, async () => "grp-1").execute({ organizationId, id: "inv-9" });
    expect(ok.calls).toEqual(["release:inv-9:grp-1"]);

    const bad = links(true);
    await expect(
      new DeleteInvoiceWithRecurrenceRelease({ execute: async () => {} }, bad.port, async () => null).execute({ organizationId, id: "inv-9" }),
    ).resolves.toBeUndefined();
  });
});
