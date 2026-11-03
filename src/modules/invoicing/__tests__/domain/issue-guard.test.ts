import { checkIssue, type IssueCheckInput } from "../../domain/services/issue-guard.service.js";

const base: IssueCheckInput = {
  seriesMode: "training",
  certificateNumber: null,
  now: { systemEntryDate: "2027-03-10T12:00:00", date: "2027-03-10", instant: "2027-03-10T12:00:00.000Z" },
  documentDate: "2027-03-10",
  lastSystemEntryAtAnySeries: "2027-03-10T11:59:00.000Z",
};

describe("bloqueios e avisos antes de emitir", () => {
  it("antes do certificado só se emite em séries de formação (DL 28/2019 art. 4.º)", () => {
    expect(checkIssue({ ...base, seriesMode: "normal" })).toEqual({ blocked: ["uncertified-program"], warnings: [] });
    expect(checkIssue(base)).toEqual({ blocked: [], warnings: [] });
  });

  it("com certificado, as séries normais ficam disponíveis", () => {
    expect(checkIssue({ ...base, seriesMode: "normal", certificateNumber: "2125" })).toEqual({ blocked: [], warnings: [] });
  });

  it("data do documento futura dá aviso (Despacho 3.4.2)", () => {
    expect(checkIssue({ ...base, documentDate: "2027-03-11" }).warnings).toEqual(["future-document-date"]);
  });

  it("relógio do sistema atrás da última emissão em qualquer série pede confirmação (Despacho 3.4.3)", () => {
    expect(checkIssue({ ...base, lastSystemEntryAtAnySeries: "2027-03-10T12:00:01.000Z" }).warnings).toEqual(["system-clock-behind"]);
  });

  it("a hora local repetida da mudança de hora não dispara o aviso (compara instantes UTC)", () => {
    const now = { systemEntryDate: "2027-10-31T01:30:00", date: "2027-10-31", instant: "2027-10-31T01:30:00.000Z" };
    expect(checkIssue({ ...base, now, documentDate: "2027-10-31", lastSystemEntryAtAnySeries: "2027-10-31T00:45:00.000Z" }).warnings).toEqual([]);
  });

  it("primeira emissão (sem documentos anteriores) passa", () => {
    expect(checkIssue({ ...base, lastSystemEntryAtAnySeries: null })).toEqual({ blocked: [], warnings: [] });
  });
});
