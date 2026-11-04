import { dec } from "../../../../kernel/money/decimal.js";
import type { SeriesState } from "../../domain/entities/series.js";
import { planNextDocument } from "../../domain/services/next-document.service.js";

const series: SeriesState = {
  ref: "11111111-1111-4111-8111-111111111111",
  legalEntityId: "22222222-2222-4222-8222-222222222222",
  locationId: null,
  documentType: "FS",
  seriesId: "L01-2027",
  mode: "training",
  validationCode: "CDF7T5HD",
  lastSequence: 0,
  lastHash: null,
  lastDocumentDate: null,
  lastSystemEntryAt: null,
};

const issue = {
  documentDate: "2027-03-10",
  systemEntryDate: "2027-03-10T12:00:00",
  systemEntryAt: "2027-03-10T12:00:00.000Z",
  grossTotal: dec("28.00"),
};

describe("próximo documento da série (Despacho 8632/2014, 1.6 e 2.1.5; Portaria 195/2020 art. 3.º)", () => {
  it("o 1.º documento da série tem o n.º 1 e assina sem hash anterior", () => {
    expect(planNextDocument(series, issue)).toEqual({
      sequence: 1,
      documentNumber: "FS L01-2027/1",
      atcud: "CDF7T5HD-1",
      signatureMessage: "2027-03-10;2027-03-10T12:00:00;FS L01-2027/1;28.00;",
      expected: { lastSequence: 0, lastHash: null },
    });
  });

  it("o seguinte continua a numeração e encadeia o hash do último da série", () => {
    const next = planNextDocument({ ...series, lastSequence: 41, lastHash: "HASHANTERIOR==", lastDocumentDate: "2027-03-09" }, issue);

    expect(next).toMatchObject({
      sequence: 42,
      documentNumber: "FS L01-2027/42",
      atcud: "CDF7T5HD-42",
      signatureMessage: "2027-03-10;2027-03-10T12:00:00;FS L01-2027/42;28.00;HASHANTERIOR==",
      expected: { lastSequence: 41, lastHash: "HASHANTERIOR==" },
    });
  });

  it("não emite numa série ainda não comunicada à AT (sem código de validação)", () => {
    expect(() => planNextDocument({ ...series, validationCode: null }, issue)).toThrow(/comunicada/);
  });

  it("não emite com data anterior ao último documento da série", () => {
    expect(() => planNextDocument({ ...series, lastSequence: 1, lastHash: "H==", lastDocumentDate: "2027-03-11" }, issue)).toThrow();
  });

  it("não emite com instante anterior ao último da série (a numeração segue a hora de emissão)", () => {
    const s = { ...series, lastSequence: 1, lastHash: "H==", lastDocumentDate: "2027-03-10", lastSystemEntryAt: "2027-03-10T12:00:01.000Z" };
    expect(() => planNextDocument(s, issue)).toThrow();
  });

  it("na mudança de hora, hora local repetida com instante a avançar é aceite", () => {
    const s = { ...series, lastSequence: 1, lastHash: "H==", lastDocumentDate: "2027-10-31", lastSystemEntryAt: "2027-10-31T00:45:00.000Z" };
    const fallBack = { documentDate: "2027-10-31", systemEntryDate: "2027-10-31T01:30:00", systemEntryAt: "2027-10-31T01:30:00.000Z", grossTotal: dec("5.00") };

    expect(planNextDocument(s, fallBack).sequence).toBe(2);
  });
});
