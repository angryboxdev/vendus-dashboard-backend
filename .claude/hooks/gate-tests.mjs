#!/usr/bin/env node
// Stop hook.
// Quando o Claude tenta encerrar a resposta, roda a suíte de testes completa.
// Se falhar, bloqueia o encerramento e devolve o erro para o Claude consertar.
// Guarda anti-loop: se este próprio hook já forçou a continuação, não insiste
// de novo (evita loop infinito de Stop).
//
// Repo-aware por natureza: roda os testes do repositório atual (onde o Claude foi
// aberto). Mudanças feitas no OUTRO repo na mesma sessão NÃO são cobertas por
// este hook — rode os testes daquele repo manualmente, ou abra o Claude Code
// direto nele para trabalho mais pesado.

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

const payload = readStdin();

// Se o Stop já está ativo por causa deste hook, deixa encerrar para não travar.
if (payload.stop_hook_active) {
  process.exit(0);
}

try {
  execSync("npx jest --silent", { stdio: "pipe", encoding: "utf8" });
  process.exit(0);
} catch (e) {
  const output = ((e.stdout || "") + (e.stderr || "")).slice(-3000);
  const out = {
    decision: "block",
    reason:
      `A suíte de testes está falhando. Não conclua antes de deixá-la verde.\n` +
      `\n\`\`\`\n${output}\n\`\`\`\n`,
  };
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}
