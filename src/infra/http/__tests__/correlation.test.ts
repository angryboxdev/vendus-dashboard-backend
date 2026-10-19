import { log, redact } from "../correlation.js";

describe("logs estruturados sem dados pessoais", () => {
  test("redige campos pessoais em qualquer nível, sem distinguir maiúsculas/_/-", () => {
    expect(
      redact({
        employeeId: "e1",
        full_name: "Pessoa Teste",
        NIF: "000000000",
        nested: { Email: "x@demo.invalid", iban: "PT50…", count: 3 },
        list: [{ latitude: 41.1, longitude: -8.6, status: "ok" }],
      }),
    ).toEqual({
      employeeId: "e1",
      full_name: "[redigido]",
      NIF: "[redigido]",
      nested: { Email: "[redigido]", iban: "[redigido]", count: 3 },
      list: [{ latitude: "[redigido]", longitude: "[redigido]", status: "ok" }],
    });
  });

  test("log() escreve uma linha JSON com evento e sem o valor pessoal", () => {
    const spy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    log("info", "employee_updated", { employeeId: "e1", name: "Pessoa Teste" });
    const line = String(spy.mock.calls[0]?.[0]);
    spy.mockRestore();
    const parsed = JSON.parse(line);
    expect(parsed).toMatchObject({ level: "info", event: "employee_updated", employeeId: "e1", name: "[redigido]" });
    expect(line).not.toContain("Pessoa Teste");
  });
});

describe("logSafeMessage", () => {
  test("mensagem curta para o log, sem e-mails nem sequências longas de dígitos", async () => {
    const { logSafeMessage } = await import("../problem-details.js");
    expect(logSafeMessage(new Error("falhou para ana.teste@demo.invalid com NIF 123456789"))).toBe("falhou para <email> com NIF <n>");
    expect(logSafeMessage(new Error("x".repeat(500)))).toHaveLength(300);
    expect(logSafeMessage({})).toBe("");
  });
});
