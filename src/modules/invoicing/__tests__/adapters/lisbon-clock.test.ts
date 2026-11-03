import { LisbonClock } from "../../adapters/out/lisbon-clock.js";

describe("relógio do estabelecimento (SystemEntryDate na hora legal de Lisboa, ao segundo)", () => {
  it("converte de UTC para a hora de verão e de inverno, sem milissegundos, e guarda o instante UTC", () => {
    expect(new LisbonClock(() => new Date("2027-07-01T10:00:00.987Z")).now()).toEqual({
      systemEntryDate: "2027-07-01T11:00:00",
      date: "2027-07-01",
      instant: "2027-07-01T10:00:00.987Z",
    });
    expect(new LisbonClock(() => new Date("2027-01-15T23:30:00Z")).now()).toEqual({
      systemEntryDate: "2027-01-15T23:30:00",
      date: "2027-01-15",
      instant: "2027-01-15T23:30:00.000Z",
    });
  });

  it("na mudança de hora de outubro a hora local repete-se, o instante não (31-10-2027)", () => {
    const before = new LisbonClock(() => new Date("2027-10-31T00:30:00Z")).now(); // 01:30 de verão
    const after = new LisbonClock(() => new Date("2027-10-31T01:30:00Z")).now(); // 01:30 de inverno

    expect(before.systemEntryDate).toBe("2027-10-31T01:30:00");
    expect(after.systemEntryDate).toBe("2027-10-31T01:30:00");
    expect(after.instant > before.instant).toBe(true);
  });
});
