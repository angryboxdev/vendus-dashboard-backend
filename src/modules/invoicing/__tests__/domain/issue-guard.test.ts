import { checkIssue, type IssueCheckInput } from "../../domain/services/issue-guard.service.js";

const base: IssueCheckInput = {
  seriesMode: "training",
  certificateNumber: null,
  now: "2027-03-10T12:00:00",
  documentDate: "2027-03-10",
  lastDocumentDateInSeries: "2027-03-09",
  lastSystemEntryDateAnySeries: "2027-03-10T11:59:00",
};

describe("bloqueios e avisos antes de emitir", () => {
  it("antes do certificado só se emite em séries de formação (DL 28/2019 art. 4.º)", () => {
    expect(checkIssue({ ...base, seriesMode: "normal" })).toEqual({ blocked: ["uncertified-program"], warnings: [] });
    expect(checkIssue({ ...base, seriesMode: "recovery" })).toEqual({ blocked: ["uncertified-program"], warnings: [] });
    expect(checkIssue(base)).toEqual({ blocked: [], warnings: [] });
  });

  it("com certificado, as séries normais ficam disponíveis", () => {
    expect(checkIssue({ ...base, seriesMode: "normal", certificateNumber: "2125" })).toEqual({ blocked: [], warnings: [] });
  });

  it("data do documento futura dá aviso (Despacho 3.4.2)", () => {
    expect(checkIssue({ ...base, documentDate: "2027-03-11" }).warnings).toEqual(["future-document-date"]);
  });

  it("não emite com data anterior à do último documento da série (Despacho 1.6, 3.2.1, 3.4.2)", () => {
    expect(checkIssue({ ...base, documentDate: "2027-03-08" }).blocked).toEqual(["date-before-last-in-series"]);
  });

  it("relógio do sistema atrás do último SystemEntryDate de qualquer série pede confirmação (Despacho 3.4.3)", () => {
    expect(checkIssue({ ...base, lastSystemEntryDateAnySeries: "2027-03-10T12:00:01" }).warnings).toEqual(["system-clock-behind"]);
  });

  it("primeira emissão (sem documentos anteriores) passa", () => {
    expect(checkIssue({ ...base, lastDocumentDateInSeries: null, lastSystemEntryDateAnySeries: null })).toEqual({ blocked: [], warnings: [] });
  });
});
