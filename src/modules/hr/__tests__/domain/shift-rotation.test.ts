import {
  ShiftRotation,
  participantOnPatternA,
  participantOnPatternB,
  weeksBetweenMondays,
} from "../../domain/entities/shift-rotation.js";
import { InvalidShiftRotationError } from "../../domain/errors.js";

function makeRotation(anchorDate = "2026-05-11") {
  return ShiftRotation.create({
    participantEmployeeIds: ["andres", "gabriel"],
    patternA: { startTime: "11:30", endTime: "15:30" },
    patternB: { startTime: "17:00", endTime: "23:00" },
    locationId: "loc-1",
    anchorDate,
  });
}

describe("ShiftRotation", () => {
  it("rejeita os 2 participantes iguais", () => {
    expect(() =>
      ShiftRotation.create({
        participantEmployeeIds: ["andres", "andres"],
        patternA: { startTime: "11:30", endTime: "15:30" },
        patternB: { startTime: "17:00", endTime: "23:00" },
        locationId: "loc-1",
        anchorDate: "2026-05-11",
      }),
    ).toThrow(InvalidShiftRotationError);
  });

  it("rejeita um padrão com início >= fim", () => {
    expect(() =>
      ShiftRotation.create({
        participantEmployeeIds: ["andres", "gabriel"],
        patternA: { startTime: "15:30", endTime: "11:30" },
        patternB: { startTime: "17:00", endTime: "23:00" },
        locationId: "loc-1",
        anchorDate: "2026-05-11",
      }),
    ).toThrow(InvalidShiftRotationError);
  });

  it("weeksBetweenMondays() conta semanas completas entre duas segundas-feiras", () => {
    expect(weeksBetweenMondays("2026-05-11", "2026-05-11")).toBe(0);
    expect(weeksBetweenMondays("2026-05-11", "2026-05-18")).toBe(1);
    expect(weeksBetweenMondays("2026-05-11", "2026-05-25")).toBe(2);
  });

  it("participantOnPatternA/B alternam a cada semana a partir do anchorDate", () => {
    const rotation = makeRotation("2026-05-11");
    expect(participantOnPatternA(rotation, "2026-05-11")).toBe("andres");
    expect(participantOnPatternB(rotation, "2026-05-11")).toBe("gabriel");

    expect(participantOnPatternA(rotation, "2026-05-18")).toBe("gabriel");
    expect(participantOnPatternB(rotation, "2026-05-18")).toBe("andres");

    expect(participantOnPatternA(rotation, "2026-05-25")).toBe("andres");
  });

  it("setActive() alterna o estado sem tocar na configuração", () => {
    const rotation = makeRotation();
    const paused = rotation.setActive(false);
    expect(paused.active).toBe(false);
    expect(paused.patternA).toEqual(rotation.patternA);
  });

  it("turno direto por omissão: secondStartTime/secondEndTime ficam null", () => {
    const rotation = makeRotation();
    expect(rotation.patternA.secondStartTime).toBeNull();
    expect(rotation.patternB.secondStartTime).toBeNull();
  });

  it("aceita um padrão repartido (2º período válido)", () => {
    const rotation = ShiftRotation.create({
      participantEmployeeIds: ["andres", "gabriel"],
      patternA: { startTime: "12:00", endTime: "16:00", secondStartTime: "19:00", secondEndTime: "23:00" },
      patternB: { startTime: "17:00", endTime: "23:00" },
      locationId: "loc-1",
      anchorDate: "2026-05-11",
    });
    expect(rotation.patternA.secondStartTime).toBe("19:00");
    expect(rotation.patternA.secondEndTime).toBe("23:00");
  });

  it("rejeita 2º período sobreposto ao 1º", () => {
    expect(() =>
      ShiftRotation.create({
        participantEmployeeIds: ["andres", "gabriel"],
        patternA: { startTime: "12:00", endTime: "16:00", secondStartTime: "15:00", secondEndTime: "20:00" },
        patternB: { startTime: "17:00", endTime: "23:00" },
        locationId: "loc-1",
        anchorDate: "2026-05-11",
      }),
    ).toThrow(InvalidShiftRotationError);
  });

  it("rejeita 2º período com início >= fim", () => {
    expect(() =>
      ShiftRotation.create({
        participantEmployeeIds: ["andres", "gabriel"],
        patternA: { startTime: "12:00", endTime: "16:00", secondStartTime: "19:00", secondEndTime: "19:00" },
        patternB: { startTime: "17:00", endTime: "23:00" },
        locationId: "loc-1",
        anchorDate: "2026-05-11",
      }),
    ).toThrow(InvalidShiftRotationError);
  });

  it("rejeita 2º período sem hora de fim", () => {
    expect(() =>
      ShiftRotation.create({
        participantEmployeeIds: ["andres", "gabriel"],
        patternA: { startTime: "12:00", endTime: "16:00", secondStartTime: "19:00" },
        patternB: { startTime: "17:00", endTime: "23:00" },
        locationId: "loc-1",
        anchorDate: "2026-05-11",
      }),
    ).toThrow(InvalidShiftRotationError);
  });
});
