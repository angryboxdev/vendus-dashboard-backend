import { WeekdaySeasonalBaselineModel, type DailyActual } from "../../domain/services/baseline-forecast.model.js";

describe("WeekdaySeasonalBaselineModel", () => {
  const model = new WeekdaySeasonalBaselineModel();

  it("zero histórico → previsões 0, nunca NaN/Infinity", () => {
    const predictions = model.predict({ history: [], horizonDays: 5, horizonStartDate: "2026-10-01" });
    expect(predictions).toHaveLength(5);
    for (const p of predictions) {
      expect(Number.isFinite(p.predictedQuantity)).toBe(true);
      expect(p.predictedQuantity).toBe(0);
      expect(p.pointsUsed).toBe(0);
    }
  });

  it("dia normal: prevê por dia-da-semana usando a média ponderada do histórico", () => {
    // 4 semanas de histórico: toda quinta-feira vende 20, resto vende 10.
    const history: DailyActual[] = [];
    const start = new Date("2026-09-03T00:00:00Z"); // uma quinta-feira
    for (let week = 0; week < 4; week++) {
      for (let day = 0; day < 7; day++) {
        const d = new Date(start);
        d.setUTCDate(d.getUTCDate() + week * 7 + day);
        const isThursday = d.getUTCDay() === 4;
        history.push({ date: d.toISOString().slice(0, 10), quantity: isThursday ? 20 : 10 });
      }
    }

    const predictions = model.predict({ history, horizonDays: 7, horizonStartDate: "2026-10-01" });
    const thursday = predictions.find((p) => new Date(`${p.date}T00:00:00Z`).getUTCDay() === 4);
    const monday = predictions.find((p) => new Date(`${p.date}T00:00:00Z`).getUTCDay() === 1);

    expect(thursday?.predictedQuantity).toBeGreaterThan(monday?.predictedQuantity ?? 0);
    expect(thursday?.pointsUsed).toBe(4);
  });

  it("pouco histórico → poucos pontos usados (sinal de baixa confiança para confidence.service)", () => {
    const predictions = model.predict({
      history: [{ date: "2026-09-28", quantity: 5 }],
      horizonDays: 3,
      horizonStartDate: "2026-10-05",
    });
    expect(predictions.every((p) => p.pointsUsed <= 1)).toBe(true);
  });

  it("nunca prevê quantidade negativa", () => {
    const history: DailyActual[] = [
      { date: "2026-09-01", quantity: 0 },
      { date: "2026-09-08", quantity: 0 },
    ];
    const predictions = model.predict({ history, horizonDays: 3, horizonStartDate: "2026-09-15" });
    expect(predictions.every((p) => p.predictedQuantity >= 0)).toBe(true);
  });
});
