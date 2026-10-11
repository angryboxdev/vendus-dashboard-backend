import { createDemoDataModule } from "../../demo-data.module.js";

/**
 * `npm run demo:generate -- [--seed 42] [--per-center 40] [--from AAAA-MM-DD] [--to AAAA-MM-DD] [--out .demo/dataset.json]`
 *
 * Só gera um ficheiro local — não escreve em nenhuma base de dados.
 */
function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const { generate } = createDemoDataModule({ outputFile: arg("out", ".demo/dataset.json") });
const summary = await generate.execute({
  seed: Number(arg("seed", "42")),
  employeesPerCenter: Number(arg("per-center", "40")),
  // Atravessa a mudança de hora de 25/10/2026 (PT e ES).
  from: arg("from", "2026-10-19"),
  to: arg("to", "2026-11-01"),
});
console.log(
  `Dados de demonstração: ${summary.tenants} organizações, ${summary.centers} centros, ${summary.employees} funcionários, ${summary.punches} marcações → ${summary.target}`,
);
