import { round6 } from "./numeric.js";

export interface DeviationInput {
  forecastValue: number;
  actualValue: number;
  /** Fração (0.2 = 20%) — configurável por chamada, nunca hardcoded num único ponto do código (secção 32). */
  percentThreshold: number;
  /** Mesma unidade de `forecastValue`/`actualValue` — impacto absoluto mínimo para não reagir a ruído. */
  absoluteThreshold: number;
}

export interface DeviationResult {
  /** Material só quando AMBOS os limiares são ultrapassados — nunca só um (secção 32/97). */
  isMaterial: boolean;
  /** `null` quando `forecastValue <= 0` — nunca `Infinity`/`NaN`. */
  deviationPercent: number | null;
  deviationAbsolute: number;
}

/**
 * Desvio material = percentagem E impacto absoluto, os dois ao mesmo
 * tempo — um desvio percentual grande num item irrelevante (ruído) nunca
 * gera pergunta ao utilizador, nem um desvio absoluto grande num volume
 * imenso onde a percentagem é insignificante.
 */
export function detectDeviation(input: DeviationInput): DeviationResult {
  const absolute = input.actualValue - input.forecastValue;
  const percent = input.forecastValue > 0 ? Math.abs(absolute) / input.forecastValue : null;
  const percentBreach = percent != null && percent >= input.percentThreshold;
  const absoluteBreach = Math.abs(absolute) >= input.absoluteThreshold;

  return {
    isMaterial: percentBreach && absoluteBreach,
    deviationPercent: percent != null ? round6(percent) : null,
    deviationAbsolute: round6(absolute),
  };
}
