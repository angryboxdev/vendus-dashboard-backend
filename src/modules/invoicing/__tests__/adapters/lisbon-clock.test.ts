import { LisbonClock } from "../../adapters/out/lisbon-clock.js";

describe("relógio do estabelecimento (SystemEntryDate na hora legal de Lisboa, ao segundo)", () => {
  it("converte de UTC para a hora de verão e de inverno, sem milissegundos", () => {
    expect(new LisbonClock(() => new Date("2027-07-01T10:00:00.987Z")).now()).toEqual({
      systemEntryDate: "2027-07-01T11:00:00",
      date: "2027-07-01",
    });
    expect(new LisbonClock(() => new Date("2027-01-15T23:30:00Z")).now()).toEqual({
      systemEntryDate: "2027-01-15T23:30:00",
      date: "2027-01-15",
    });
  });
});
