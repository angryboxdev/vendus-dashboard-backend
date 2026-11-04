import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AtQueueItem } from "../../domain/entities/at-communication.js";
import type { SeriesState } from "../../domain/entities/series.js";
import { communicationDeadline, nextAtAction, retryDelayMinutes, summarizeQueue } from "../../domain/services/at-queue.service.js";
import { cancelSeriesBody, finalizeSeriesBody, parseSeriesResponse, registerSeriesBody } from "../../domain/services/at-series-message.service.js";
import { soapEnvelope, usernameTokenHeader } from "../../domain/services/at-soap.service.js";

const series: SeriesState = {
  ref: "s1",
  legalEntityId: "le-1",
  locationId: null,
  documentType: "FS",
  seriesId: "L01-2027",
  mode: "training",
  validationCode: null,
  lastSequence: 0,
  lastHash: null,
  lastDocumentDate: null,
  lastSystemEntryAt: null,
};

// Para validar à mão contra o esquema do Comunicacao_Series.wsdl (ver .scratch/certificacao-at/validacao-saft/).
const out = join(__dirname, "..", "fixtures");
writeFileSync(join(out, "series-registar.test-output.xml"), registerSeriesBody(series, { startDate: "2027-03-10", certificateNumber: "0" }), "utf8");
writeFileSync(join(out, "series-finalizar.test-output.xml"), finalizeSeriesBody({ ...series, validationCode: "ABCD1234", lastSequence: 42 }, "Fim"), "utf8");
writeFileSync(join(out, "series-anular.test-output.xml"), cancelSeriesBody({ ...series, validationCode: "ABCD1234" }), "utf8");

describe("Séries (Comunicacao_Series.wsdl)", () => {
  it("registarSerie: formação → tipoSerie F, faturas → classeDoc SI, sem certificado → 0, programa informático", () => {
    expect(registerSeriesBody(series, { startDate: "2027-03-10", certificateNumber: "0" })).toBe(
      '<at:registarSerie xmlns:at="http://at.gov.pt/"><serie>L01-2027</serie><tipoSerie>F</tipoSerie><classeDoc>SI</classeDoc><tipoDoc>FS</tipoDoc>' +
        "<numInicialSeq>1</numInicialSeq><dataInicioPrevUtiliz>2027-03-10</dataInicioPrevUtiliz><numCertSWFatur>0</numCertSWFatur>" +
        "<meioProcessamento>PI</meioProcessamento></at:registarSerie>",
    );
  });

  it("consulta de mesa → classeDoc WD; série normal → tipoSerie N", () => {
    const body = registerSeriesBody({ ...series, documentType: "CM", mode: "normal" }, { startDate: "2027-03-10", certificateNumber: "2125" });
    expect(body).toContain("<tipoSerie>N</tipoSerie><classeDoc>WD</classeDoc><tipoDoc>CM</tipoDoc>");
    expect(body).toContain("<numCertSWFatur>2125</numCertSWFatur>");
  });

  it("finalizar indica o último documento emitido; anular declara a não emissão com motivo ER", () => {
    const used = { ...series, validationCode: "ABCD1234", lastSequence: 42 };
    expect(finalizeSeriesBody(used, "Mudança de ano")).toBe(
      '<at:finalizarSerie xmlns:at="http://at.gov.pt/"><serie>L01-2027</serie><classeDoc>SI</classeDoc><tipoDoc>FS</tipoDoc>' +
        "<codValidacaoSerie>ABCD1234</codValidacaoSerie><seqUltimoDocEmitido>42</seqUltimoDocEmitido><justificacao>Mudança de ano</justificacao></at:finalizarSerie>",
    );
    expect(cancelSeriesBody({ ...series, validationCode: "ABCD1234" })).toContain("<motivo>ER</motivo><declaracaoNaoEmissao>true</declaracaoNaoEmissao>");
  });

  it("resposta: resultado e séries devolvidas (qualquer prefixo)", () => {
    const xml =
      '<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/"><S:Body><ns2:registarSerieResponse xmlns:ns2="http://at.gov.pt/"><registarSerieResp>' +
      "<infoSerie><serie>L01-2027</serie><tipoSerie>F</tipoSerie><classeDoc>SI</classeDoc><tipoDoc>FS</tipoDoc><numInicialSeq>1</numInicialSeq>" +
      "<dataInicioPrevUtiliz>2027-03-10</dataInicioPrevUtiliz><meioProcessamento>PI</meioProcessamento><numCertSWFatur>0</numCertSWFatur>" +
      "<codValidacaoSerie>AAJFJ4VD</codValidacaoSerie><dataRegisto>2027-03-10</dataRegisto><estado>A</estado><dataEstado>2027-03-10T12:00:00</dataEstado><nifComunicou>599999999</nifComunicou></infoSerie>" +
      "<infoResultOper><codResultOper>2001</codResultOper><msgResultOper>Operação efetuada com sucesso.</msgResultOper></infoResultOper>" +
      "</registarSerieResp></ns2:registarSerieResponse></S:Body></S:Envelope>";
    expect(parseSeriesResponse(xml)).toEqual({
      code: 2001,
      message: "Operação efetuada com sucesso.",
      series: [{ seriesId: "L01-2027", documentType: "FS", validationCode: "AAJFJ4VD", status: "A" }],
    });
  });

  it("recusa sem infoSerie: só o resultado", () => {
    const xml = "<x><infoResultOper><codResultOper>4049</codResultOper><msgResultOper>Data de início inválida</msgResultOper></infoResultOper></x>";
    expect(parseSeriesResponse(xml)).toEqual({ code: 4049, message: "Data de início inválida", series: [] });
  });
});

describe("Envelope SOAP e WS-Security", () => {
  it("UsernameToken no namespace secext da AT, valores escapados", () => {
    const header = usernameTokenHeader({ username: "599999999/37", password: "cGFzcw==", nonce: "bm9uY2U=", created: "Y3JlYXRlZA==" });
    expect(soapEnvelope(header, "<b/>")).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/"><S:Header>' +
        '<wss:Security xmlns:wss="http://schemas.xmlsoap.org/ws/2002/12/secext"><wss:UsernameToken><wss:Username>599999999/37</wss:Username>' +
        "<wss:Password>cGFzcw==</wss:Password><wss:Nonce>bm9uY2U=</wss:Nonce><wss:Created>Y3JlYXRlZA==</wss:Created></wss:UsernameToken></wss:Security>" +
        "</S:Header><S:Body><b/></S:Body></S:Envelope>",
    );
  });
});

const item = (over: Partial<AtQueueItem> = {}): AtQueueItem => ({
  documentId: "d1",
  legalEntityId: "le-1",
  documentNumber: "FS L01-2027/1",
  documentType: "FS",
  documentDate: "2027-03-10",
  status: "N",
  acceptedStatus: null,
  failures: 0,
  lastAttemptAt: null,
  lastOutcome: null,
  lastCode: null,
  lastMessage: null,
  ...over,
});
const NOW = new Date("2027-03-10T12:00:00Z");

describe("Fila do e-Fatura", () => {
  it("prazo: dia 5 do mês seguinte (dezembro → janeiro do ano seguinte)", () => {
    expect(communicationDeadline("2027-03-31")).toBe("2027-04-05");
    expect(communicationDeadline("2027-12-01")).toBe("2028-01-05");
  });

  it("intervalo entre tentativas cresce até 6 horas", () => {
    expect([0, 1, 2, 3, 10].map(retryDelayMinutes)).toEqual([0, 5, 10, 20, 360]);
  });

  it("nunca aceite → registar; aceite noutro estado → mudança de estado", () => {
    expect(nextAtAction(item(), NOW)).toBe("register");
    expect(nextAtAction(item({ status: "A", acceptedStatus: "N" }), NOW)).toBe("change-status");
    expect(nextAtAction(item({ acceptedStatus: "N" }), NOW)).toBeNull();
  });

  it("falha recente espera o intervalo; recusas só com «forçar»", () => {
    expect(nextAtAction(item({ failures: 1, lastOutcome: "failed", lastAttemptAt: "2027-03-10T11:57:00Z" }), NOW)).toBeNull();
    expect(nextAtAction(item({ failures: 1, lastOutcome: "failed", lastAttemptAt: "2027-03-10T11:54:00Z" }), NOW)).toBe("register");
    expect(nextAtAction(item({ lastOutcome: "rejected" }), NOW)).toBeNull();
    expect(nextAtAction(item({ lastOutcome: "auth" }), NOW)).toBeNull();
    expect(nextAtAction(item({ lastOutcome: "rejected" }), NOW, { force: true })).toBe("register");
  });

  it("credenciais recusadas: nem com «forçar» (não bloquear o subutilizador); só depois de regravadas", () => {
    const refused = item({ lastOutcome: "auth", lastAttemptAt: "2027-03-10T11:00:00Z" });
    expect(nextAtAction(refused, NOW, { force: true, credentialsUpdatedAt: "2027-03-09T00:00:00Z" })).toBeNull();
    expect(nextAtAction(refused, NOW, { credentialsUpdatedAt: "2027-03-10T11:30:00Z" })).toBe("register");
  });

  it("resumo: pendentes, bloqueados e prazo do mais antigo", () => {
    const items = [item({ documentDate: "2027-02-27", lastOutcome: "rejected" }), item({ documentDate: "2027-03-02" })];
    expect(summarizeQueue(items, "2027-03-03")).toEqual({ pending: 2, blocked: 1, oldestPendingDate: "2027-02-27", deadline: "2027-03-05", overdue: false, dueSoon: true });
    expect(summarizeQueue(items, "2027-03-06").overdue).toBe(true);
    expect(summarizeQueue([], "2027-03-06")).toEqual({ pending: 0, blocked: 0, oldestPendingDate: null, deadline: null, overdue: false, dueSoon: false });
  });
});
