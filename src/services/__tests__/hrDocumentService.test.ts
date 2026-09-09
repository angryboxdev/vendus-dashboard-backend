/**
 * `.scratch/kiosk-pin-storage-prefix/issues/04-hr-documents-prefixing-and-policies.md`:
 * the organization now threads through `uploadDocument`'s storage call and
 * `getDocumentSignedUrl`'s call exactly like any other argument (spec.md
 * Section B Testing Decisions: "the organization threads through exactly as
 * any other argument, per the existing test seams ... no new seam"). This
 * is the first test file for this service — none existed before this
 * ticket.
 *
 * `object-storage.js` and `supabase-client.js` are mocked by module path
 * (not imported for real) because this file lives outside
 * `src/infra/scoped-db` — a real import of either would trip the
 * `supabase-so-no-scoped-db` dependency-cruiser rule (ADR-0007/0008), same
 * reasoning as `hrEmployeeService.test.ts`.
 */
jest.mock("crypto", () => ({ randomUUID: () => "doc-1" }));

jest.mock("../../infra/scoped-db/object-storage.js", () => ({
  objectStorage: {
    upload: jest.fn(),
    remove: jest.fn(),
    createSignedUrl: jest.fn(),
    getPublicUrl: jest.fn(),
  },
}));

jest.mock("../../infra/scoped-db/supabase-client.js", () => ({
  getSupabaseServiceRole: jest.fn(),
}));

import { uploadDocument, getDocumentSignedUrl } from "../hrDocumentService.js";
import { objectStorage } from "../../infra/scoped-db/object-storage.js";
import { mintOrganizationId } from "../../kernel/organization-id.js";

const mockedObjectStorage = objectStorage as unknown as {
  upload: jest.Mock;
  remove: jest.Mock;
  createSignedUrl: jest.Mock;
};
// `supabase-client.js` is mocked by module path string, not imported
// directly (see file header) — read back via `jest.requireMock`, matching
// `hrEmployeeService.test.ts`.
const mockedGetSupabaseServiceRole = (
  jest.requireMock("../../infra/scoped-db/supabase-client.js") as { getSupabaseServiceRole: jest.Mock }
).getSupabaseServiceRole;

interface RecordedFrom {
  table: string;
  insertValues?: unknown;
  eqCalls: Array<[string, unknown]>;
}

function fakeSupabaseClient(response: { data: unknown; error: unknown }) {
  const froms: RecordedFrom[] = [];

  const client = {
    from(table: string) {
      const record: RecordedFrom = { table, eqCalls: [] };
      froms.push(record);

      const builder = {
        select() {
          return builder;
        },
        insert(values: unknown) {
          record.insertValues = values;
          return builder;
        },
        eq(column: string, value: unknown) {
          record.eqCalls.push([column, value]);
          return builder;
        },
        order() {
          return builder;
        },
        single() {
          return builder;
        },
        maybeSingle() {
          return builder;
        },
        delete() {
          return builder;
        },
        then(resolve: (value: unknown) => void) {
          resolve(response);
        },
      };
      return builder;
    },
  };

  return { client, froms };
}

describe("hrDocumentService.uploadDocument", () => {
  const orgA = mintOrganizationId("org-a");

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("threads the organization into the storage upload call, alongside the other upload arguments", async () => {
    const actualPath = "org-a/employee-1/doc-1/contract.pdf";
    mockedObjectStorage.upload.mockResolvedValue(actualPath);
    const { client } = fakeSupabaseClient({
      data: { id: "doc-1", employee_id: "employee-1", document_type: "contract", file_name: "contract.pdf", storage_path: actualPath, uploaded_at: "2026-09-09T00:00:00Z" },
      error: null,
    });
    mockedGetSupabaseServiceRole.mockReturnValue(client);
    const buffer = Buffer.from("pdf");

    await uploadDocument(orgA, {
      employeeId: "employee-1",
      documentType: "contract",
      fileName: "contract.pdf",
      buffer,
      mimeType: "application/pdf",
    });

    expect(mockedObjectStorage.upload).toHaveBeenCalledWith(
      "hr-documents",
      "employee-1/doc-1/contract.pdf",
      buffer,
      "application/pdf",
      orgA,
    );
  });

  it("persists the actual (org-prefixed) path the storage upload returns, not the pre-prefix one", async () => {
    const actualPath = "org-a/employee-1/doc-1/contract.pdf";
    mockedObjectStorage.upload.mockResolvedValue(actualPath);
    const { client, froms } = fakeSupabaseClient({
      data: { id: "doc-1", employee_id: "employee-1", document_type: "contract", file_name: "contract.pdf", storage_path: actualPath, uploaded_at: "2026-09-09T00:00:00Z" },
      error: null,
    });
    mockedGetSupabaseServiceRole.mockReturnValue(client);

    const doc = await uploadDocument(orgA, {
      employeeId: "employee-1",
      documentType: "contract",
      fileName: "contract.pdf",
      buffer: Buffer.from("pdf"),
      mimeType: "application/pdf",
    });

    expect(froms[0]?.insertValues).toMatchObject({ storage_path: actualPath });
    expect(doc.storagePath).toBe(actualPath);
  });
});

describe("hrDocumentService.getDocumentSignedUrl", () => {
  const orgA = mintOrganizationId("org-a");

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("threads the organization into the signed-url call, and passes an unprefixed legacy path through unchanged", async () => {
    mockedObjectStorage.createSignedUrl.mockResolvedValue("https://storage.example.com/signed");
    const legacyPath = "employee-1/doc-1/contract.pdf";

    const url = await getDocumentSignedUrl(orgA, legacyPath);

    expect(mockedObjectStorage.createSignedUrl).toHaveBeenCalledWith("hr-documents", legacyPath, 120, orgA);
    expect(url).toBe("https://storage.example.com/signed");
  });
});
