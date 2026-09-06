/**
 * Reset completo de stock: apaga TODOS os stock_movements da organização.
 * Após este reset, current_quantity de todos os itens fica 0 (calculado dinamicamente).
 *
 * Uso:
 *   DRY_RUN=1 npx tsx src/jobs/resetStockMovements.ts   ← ver contagem sem apagar
 *   npx tsx src/jobs/resetStockMovements.ts              ← apagar (pede confirmação no terminal)
 */
import "../config/env.js";
import { createScopedQuery } from "../infra/scoped-db/scoped-query.js";
import { UNATTENDED_SCOPE } from "../infra/scoped-db/unattended-scope.js";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const dryRun =
  process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

const scoped = createScopedQuery(UNATTENDED_SCOPE.organizationId);

// Contar movimentos existentes
const { count, error: countErr } = await scoped
  .table("stock_movements")
  .select("id", { count: "exact", head: true });

if (countErr) {
  console.error("Erro ao contar movimentos:", countErr.message);
  process.exit(1);
}

const total = count ?? 0;
console.log(`\nTotal de stock_movements na organização: ${total}`);

if (total === 0) {
  console.log("Nada a apagar. Stock já está a zero.");
  process.exit(0);
}

if (dryRun) {
  console.log(
    `[DRY RUN] Seriam apagados ${total} movimentos. Corre sem DRY_RUN=1 para confirmar.`
  );
  process.exit(0);
}

// Confirmação interativa
const rl = readline.createInterface({ input, output });
const answer = await rl.question(
  `\nTens a certeza que queres apagar ${total} movimentos? (escreve "sim" para confirmar): `
);
rl.close();

if (answer.trim().toLowerCase() !== "sim") {
  console.log("Operação cancelada.");
  process.exit(0);
}

// Apagar todos os movimentos
const { error: delErr } = await scoped
  .table("stock_movements")
  .delete()
  .neq("id", "00000000-0000-0000-0000-000000000000"); // condição always-true para apagar tudo

if (delErr) {
  console.error("Erro ao apagar movimentos:", delErr.message);
  process.exit(1);
}

console.log(`\n✓ ${total} movimentos apagados. Stock de todos os itens está agora a 0.`);
console.log(
  "\nPróximo passo: após a contagem física, insere um movimento de tipo 'adjustment' por item com a quantidade real."
);
process.exit(0);
