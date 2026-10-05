import { identifyPayslipEmployee, normalizeForMatch } from "../../domain/services/payslip-identification.service.js";

// Dados fictícios (RGPD) — NIFs inventados.
const CARLOS = { id: "11111111-1111-4111-8111-111111111111", fullName: "Carlos Andrés", nif: "100000001" };
const GABRIEL = { id: "22222222-2222-4222-8222-222222222222", fullName: "Gabriel Gomes", nif: "100000002" };
const ANA = { id: "33333333-3333-4333-8333-333333333333", fullName: "Ana Silva", nif: null };
const ANA_COSTA = { id: "44444444-4444-4444-8444-444444444444", fullName: "Ana Silva Costa", nif: null };
const CARLOS_SOUSA = { id: "55555555-5555-4555-8555-555555555555", fullName: "Carlos Sousa", nif: "100000005" };
const ALL = [CARLOS, GABRIEL, ANA, ANA_COSTA];

describe("identifyPayslipEmployee", () => {
  it("normaliza acentos, maiúsculas e pontuação", () => {
    expect(normalizeForMatch("  CARLOS  Andrés-Núñez ")).toBe("carlos andres nunez");
  });

  it("identifica pelo NIF no texto, mesmo agrupado em blocos", () => {
    const text = "Recibo de vencimento\nEmpresa Exemplo, Lda — NIF 500000000\nContribuinte: 100 000 002\nSetembro 2026";
    expect(identifyPayslipEmployee({ fileName: "doc123.pdf", text }, ALL)).toEqual({ status: "identified", employeeId: GABRIEL.id, reason: "nif" });
  });

  it("identifica pelo nome completo normalizado no texto", () => {
    const text = "Nome: CARLOS ANDRES\nVencimento base 1000,00";
    expect(identifyPayslipEmployee({ fileName: "doc123.pdf", text }, ALL)).toEqual({ status: "identified", employeeId: CARLOS.id, reason: "name" });
  });

  it("nome contido noutro nome: fica o mais completo", () => {
    const text = "Funcionário: Ana Silva Costa";
    expect(identifyPayslipEmployee({ fileName: "x.pdf", text }, ALL)).toEqual({ status: "identified", employeeId: ANA_COSTA.id, reason: "name" });
  });

  it("identifica pelo nome do ficheiro quando o PDF não tem texto (ex: carlos.pdf)", () => {
    expect(identifyPayslipEmployee({ fileName: "carlos.pdf", text: null }, ALL)).toEqual({ status: "identified", employeeId: CARLOS.id, reason: "file_name" });
    expect(identifyPayslipEmployee({ fileName: "Recibo_Setembro_Gabriel_Gomes.pdf", text: null }, ALL)).toMatchObject({ status: "identified", employeeId: GABRIEL.id });
  });

  it("ficheiro sem pistas → Rever, sem associação", () => {
    expect(identifyPayslipEmployee({ fileName: "doc123.pdf", text: null }, ALL)).toEqual({ status: "review", reason: "no_match", candidateIds: [] });
  });

  it("primeiro nome partilhado por dois colaboradores → Rever (ambíguo)", () => {
    const result = identifyPayslipEmployee({ fileName: "carlos.pdf", text: null }, [...ALL, CARLOS_SOUSA]);
    expect(result).toEqual({ status: "review", reason: "ambiguous", candidateIds: [CARLOS.id, CARLOS_SOUSA.id] });
  });

  it("NIF de um colaborador e nome de outro → Rever (conflito)", () => {
    const text = "Nome: Gabriel Gomes\nNIF 100000001";
    expect(identifyPayslipEmployee({ fileName: "x.pdf", text }, ALL)).toMatchObject({ status: "review", reason: "conflict" });
  });

  it("identifica pelo id do colaborador no nome do ficheiro", () => {
    expect(identifyPayslipEmployee({ fileName: `recibo_${ANA.id}.pdf`, text: null }, ALL)).toEqual({ status: "identified", employeeId: ANA.id, reason: "employee_id" });
  });

  it("dois NIFs de colaboradores no mesmo PDF → Rever", () => {
    const text = "100000001 100000002";
    expect(identifyPayslipEmployee({ fileName: "x.pdf", text }, ALL)).toMatchObject({ status: "review", reason: "ambiguous" });
  });
});
