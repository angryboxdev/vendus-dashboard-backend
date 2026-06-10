#!/usr/bin/env node
// PostToolUse hook.
// Depois que o Claude edita/cria um arquivo .ts em src/modules/<modulo>/,
// roda (1) o lint de fronteiras da arquitetura e (2) os testes daquele módulo.
// Se algo falhar, devolve a saída para o Claude corrigir (decision: block).

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

// Repo-aware: só age em arquivos dentro DESTE repositório.
function inThisRepo(filePath, projectDir) {
  if (!filePath) return false;
  const abs = resolve(projectDir, filePath);
  const root = resolve(projectDir);
  return abs === root || abs.startsWith(root + "/");
}

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const payload = readStdin();
const ti = payload.tool_input || payload.toolInput || {};
const filePath = ti.file_path || ti.path || ti.filePath || "";

// Só age em arquivos TypeScript deste repo e dentro de um módulo.
const match = filePath.match(/src\/modules\/([^/]+)\//);
if (!inThisRepo(filePath, projectDir) || !match || !/\.tsx?$/.test(filePath)) {
  process.exit(0);
}
const moduleName = match[1];

function run(label, cmd) {
  try {
    execSync(cmd, { stdio: "pipe", encoding: "utf8" });
    return null;
  } catch (e) {
    const output = (e.stdout || "") + (e.stderr || "");
    return `\n### ${label} falhou\n\n\`\`\`\n${output.slice(-3000)}\n\`\`\`\n`;
  }
}

let problems = "";

// 1) Fronteiras da arquitetura (domain não pode importar de adapters/infra).
problems +=
  run(
    "Lint de fronteiras (dependency-cruiser)",
    `npx depcruise src/modules/${moduleName} --config .dependency-cruiser.cjs`,
  ) || "";

// 2) Testes do módulo afetado.
problems +=
  run("Testes do módulo", `npx jest src/modules/${moduleName} --silent`) || "";

if (problems) {
  const out = {
    decision: "block",
    reason:
      `Os checks automáticos do módulo "${moduleName}" falharam após sua ` +
      `alteração. Corrija antes de prosseguir:\n${problems}`,
  };
  process.stdout.write(JSON.stringify(out));
}

process.exit(0);
