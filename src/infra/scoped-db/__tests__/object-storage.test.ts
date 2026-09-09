import { mintOrganizationId } from "../../../kernel/organization-id.js";
import { STORAGE_BUCKET_REGISTRY, type StorageBucketName } from "../object-storage.js";

/**
 * Mirrors scoped-query.test.ts's shape for the sibling helper: a fake
 * Storage builder recording every call before any request is made, per
 * spec.md's Testing Decisions for this seam ("no database, PostgREST/Storage
 * builder inspected before any request is made").
 */
interface RecordedUpload {
  bucket: string;
  path: string;
  options: unknown;
}
interface RecordedRemove {
  bucket: string;
  paths: string[];
}
interface RecordedPublicUrl {
  bucket: string;
  path: string;
}
interface RecordedSignedUrl {
  bucket: string;
  path: string;
  expiresIn: number;
}

function fakeSupabaseClient() {
  const uploads: RecordedUpload[] = [];
  const removes: RecordedRemove[] = [];
  const publicUrlCalls: RecordedPublicUrl[] = [];
  const signedUrlCalls: RecordedSignedUrl[] = [];

  const client = {
    storage: {
      from(bucket: string) {
        return {
          upload(path: string, _buffer: Buffer, options: unknown) {
            uploads.push({ bucket, path, options });
            return Promise.resolve({ error: null });
          },
          getPublicUrl(path: string) {
            publicUrlCalls.push({ bucket, path });
            return { data: { publicUrl: `https://storage.example.com/object/public/${bucket}/${path}` } };
          },
          remove(paths: string[]) {
            removes.push({ bucket, paths });
            return Promise.resolve({ error: null });
          },
          createSignedUrl(path: string, expiresIn: number) {
            signedUrlCalls.push({ bucket, path, expiresIn });
            return Promise.resolve({
              data: { signedUrl: `https://storage.example.com/object/sign/${bucket}/${path}` },
              error: null,
            });
          },
        };
      },
    },
  };

  return { client, uploads, removes, publicUrlCalls, signedUrlCalls };
}

let currentClient: unknown;

jest.mock("../supabase-client.js", () => ({
  getSupabaseServiceRole: () => currentClient,
}));

import { objectStorage } from "../object-storage.js";

describe("objectStorage", () => {
  const orgA = mintOrganizationId("org-a");

  it("prefixes the upload path with the organization for an opted-in bucket", async () => {
    const { client, uploads } = fakeSupabaseClient();
    currentClient = client;

    const actualPath = await objectStorage.upload(
      "hr-documents",
      "employee-1/doc-1/contract.pdf",
      Buffer.from("pdf"),
      "application/pdf",
      orgA,
    );

    expect(actualPath).toBe("org-a/employee-1/doc-1/contract.pdf");
    expect(uploads).toEqual([
      { bucket: "hr-documents", path: "org-a/employee-1/doc-1/contract.pdf", options: { contentType: "application/pdf", upsert: false } },
    ]);
  });

  it("prefixes the upload path for the other opted-in bucket (invoice-documents)", async () => {
    const { client, uploads } = fakeSupabaseClient();
    currentClient = client;

    const actualPath = await objectStorage.upload(
      "invoice-documents",
      "1700000000_invoice.pdf",
      Buffer.from("pdf"),
      "application/pdf",
      orgA,
    );

    expect(actualPath).toBe("org-a/1700000000_invoice.pdf");
    expect(uploads[0]?.path).toBe("org-a/1700000000_invoice.pdf");
  });

  it("does not prefix the upload path for a bucket that hasn't opted in", async () => {
    const { client, uploads } = fakeSupabaseClient();
    currentClient = client;

    const actualPath = await objectStorage.upload(
      "recurrence-documents",
      "1700000000_receipt.pdf",
      Buffer.from("pdf"),
      "application/pdf",
      orgA,
    );

    expect(actualPath).toBe("1700000000_receipt.pdf");
    expect(uploads).toEqual([
      { bucket: "recurrence-documents", path: "1700000000_receipt.pdf", options: { contentType: "application/pdf", upsert: false } },
    ]);
  });

  it("createSignedUrl accepts an unprefixed legacy path unchanged, even for an opted-in bucket", async () => {
    const { client, signedUrlCalls } = fakeSupabaseClient();
    currentClient = client;

    const url = await objectStorage.createSignedUrl("hr-documents", "employee-1/doc-1/contract.pdf", 120, orgA);

    expect(signedUrlCalls).toEqual([{ bucket: "hr-documents", path: "employee-1/doc-1/contract.pdf", expiresIn: 120 }]);
    expect(url).toBe("https://storage.example.com/object/sign/hr-documents/employee-1/doc-1/contract.pdf");
  });

  it("getPublicUrl accepts an unprefixed legacy path unchanged, even for an opted-in bucket", () => {
    const { client, publicUrlCalls } = fakeSupabaseClient();
    currentClient = client;

    const url = objectStorage.getPublicUrl("invoice-documents", "1700000000_invoice.pdf", orgA);

    expect(publicUrlCalls).toEqual([{ bucket: "invoice-documents", path: "1700000000_invoice.pdf" }]);
    expect(url).toBe("https://storage.example.com/object/public/invoice-documents/1700000000_invoice.pdf");
  });

  it("getPublicUrl also leaves an already-prefixed path unchanged", () => {
    const { client, publicUrlCalls } = fakeSupabaseClient();
    currentClient = client;

    objectStorage.getPublicUrl("invoice-documents", "org-a/1700000000_invoice.pdf", orgA);

    expect(publicUrlCalls).toEqual([{ bucket: "invoice-documents", path: "org-a/1700000000_invoice.pdf" }]);
  });

  it("remove passes the given path through unchanged", async () => {
    const { client, removes } = fakeSupabaseClient();
    currentClient = client;

    await objectStorage.remove("hr-documents", "employee-1/doc-1/contract.pdf");

    expect(removes).toEqual([{ bucket: "hr-documents", paths: ["employee-1/doc-1/contract.pdf"] }]);
  });

  it("registers exactly the five known buckets, with the two fiscal-document buckets opted into prefixing", () => {
    expect(STORAGE_BUCKET_REGISTRY).toEqual({
      "hr-documents": { prefixByOrganization: true },
      "invoice-documents": { prefixByOrganization: true },
      "recurrence-documents": { prefixByOrganization: false },
      "bank-statement-documents": { prefixByOrganization: false },
      "invoice-imports": { prefixByOrganization: false },
    });
  });

  it("a bucket absent from the registry does not compile", () => {
    // @ts-expect-error — "not-a-real-bucket" is not a key of STORAGE_BUCKET_REGISTRY.
    const bucket: StorageBucketName = "not-a-real-bucket";
    void bucket;
  });
});
