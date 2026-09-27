import { BaseScheduleTemplate } from "../../domain/entities/base-schedule-template.js";
import { InvalidBaseScheduleTemplateError } from "../../domain/errors.js";

describe("BaseScheduleTemplate", () => {
  it("createDayOff() marca isDayOff sem horário", () => {
    const cell = BaseScheduleTemplate.createDayOff("emp-1", 5);
    expect(cell.isDayOff).toBe(true);
    expect(cell.startTime).toBeNull();
    expect(cell.endTime).toBeNull();
  });

  it("createWorkingDay() guarda o horário e a loja", () => {
    const cell = BaseScheduleTemplate.createWorkingDay({
      employeeId: "emp-1",
      weekday: 0,
      startTime: "08:00",
      endTime: "17:00",
      locationId: "loc-1",
      breakMinutes: 60,
    });
    expect(cell.isDayOff).toBe(false);
    expect(cell.startTime).toBe("08:00");
    expect(cell.breakMinutes).toBe(60);
  });

  it("rejeita início >= fim num dia de trabalho", () => {
    expect(() =>
      BaseScheduleTemplate.createWorkingDay({
        employeeId: "emp-1",
        weekday: 0,
        startTime: "17:00",
        endTime: "08:00",
        locationId: "loc-1",
      }),
    ).toThrow(InvalidBaseScheduleTemplateError);
  });
});
