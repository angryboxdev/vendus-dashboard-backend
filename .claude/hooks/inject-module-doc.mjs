#!/usr/bin/env node
// PreToolUse hook.
// Quando o Claude vai editar/criar um arquivo dentro de src/modules/<modulo>/,
// este hook lê o README.md desse módulo e injeta no contexto, para que o Claude
// SEMPRE conheça as decisões de design antes de mexer — sem você precisar pedir.

import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

// Lê o payload JSON que o Claude Code manda via stdin.
function readStdin() {
  try {
    return JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

// Repo-aware: só age em arquivos dentro DESTE repositório. Evita disparar contra
// arquivos do outro repo (ex.: front) quando o Claude foi aberto aqui no back.
function inThisRepo(filePath, projectDir) {
  if (!filePath) return false;
  const abs = resolve(projectDir, filePath);
  const root = resolve(projectDir);
  return abs === root || abs.startsWith(root + "/");
}

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const payload = readStdin();

// O caminho do arquivo costuma vir em tool_input.file_path. Cobrimos variações.
const ti = payload.tool_input || payload.toolInput || {};
const filePath = ti.file_path || ti.path || ti.filePath || "";

if (!inThisRepo(filePath, projectDir)) {
  process.exit(0);
}

// Descobre o módulo a partir do caminho: src/modules/<modulo>/...
const match = filePath.match(/src\/modules\/([^/]+)\//);
if (match) {
  const moduleName = match[1];
  const readmePath = join(projectDir, "src", "modules", moduleName, "README.md");
  if (existsSync(readmePath)) {
    const doc = readFileSync(readmePath, "utf8");
    // Emite additionalContext: o Claude Code injeta isto no contexto da sessão.
    const out = {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext:
          `Documentação do módulo "${moduleName}" (leia antes de alterar, ` +
          `atente-se a "Decisões de design"):\n\n${doc}`,
      },
    };
    process.stdout.write(JSON.stringify(out));
  }
}

// Sempre sai 0 (não bloqueia a edição).
process.exit(0);
