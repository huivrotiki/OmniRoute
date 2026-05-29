/**
 * OpenCode Skill — настройка и управление opencode CLI
 * Skill ID: opencode-manager
 *
 * Возможности:
 * - install: установить opencode глобально
 * - status: проверить установку и версию
 * - configure: настроить провайдер (указывает на наш OmniRoute)
 * - run: запустить opencode задачу (non-interactive)
 * - list_models: список доступных моделей через OmniRoute
 * - update: обновить до последней версии
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync, writeFileSync, readFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { SkillHandler } from "../types.js";

const execFileAsync = promisify(execFile);

// Безопасный запуск команд — значения через env, не интерполяция строк (hard rule #13)
async function safeExec(
  cmd: string,
  args: string[],
  env?: Record<string, string>
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(cmd, args, {
    env: { ...process.env, ...(env ?? {}) },
    timeout: 30_000,
  });
}

// Найти бинарник opencode
async function findOpencodeBin(): Promise<string | null> {
  const candidates = [
    process.env.OPENCODE_BIN,
    "opencode",
    "/usr/local/bin/opencode",
    join(homedir(), ".local", "bin", "opencode"),
  ].filter(Boolean) as string[];

  for (const bin of candidates) {
    try {
      await safeExec(bin, ["--version"]);
      return bin;
    } catch {
      continue;
    }
  }
  return null;
}

// Путь к конфигу opencode
function getOpencodeConfigPath(): string {
  const configDir =
    process.env.OPENCODE_CONFIG_DIR ??
    join(homedir(), ".config", "opencode");
  return join(configDir, "config.json");
}

export const opencodeSkillHandler: SkillHandler = async (input, context) => {
  const action = (input["action"] as string) ?? "status";

  // ── ACTION: status ──────────────────────────────────────────────────────────
  if (action === "status") {
    const bin = await findOpencodeBin();
    if (!bin) {
      return {
        installed: false,
        message: "opencode не найден. Запусти action=install для установки.",
        hint: "npm install -g opencode-ai  или  curl -fsSL https://opencode.ai/install | sh",
      };
    }
    try {
      const { stdout } = await safeExec(bin, ["--version"]);
      const configPath = getOpencodeConfigPath();
      const configExists = existsSync(configPath);
      let config: Record<string, unknown> = {};
      if (configExists) {
        try {
          config = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
        } catch {
          // ignore parse errors
        }
      }
      return {
        installed: true,
        version: stdout.trim(),
        bin,
        configPath,
        configExists,
        provider: (config["model"] as string) ?? "не настроен",
        apiBase: (config["apiBase"] as string) ?? "не настроен",
      };
    } catch (err) {
      return { installed: false, error: String(err) };
    }
  }

  // ── ACTION: install ─────────────────────────────────────────────────────────
  if (action === "install") {
    const method = (input["method"] as string) ?? "npm";
    try {
      if (method === "npm") {
        const { stdout, stderr } = await execFileAsync(
          "npm",
          ["install", "-g", "opencode-ai"],
          { timeout: 120_000 }
        );
        return { success: true, method: "npm", stdout: stdout.trim(), stderr: stderr.trim() };
      }
      if (method === "curl") {
        // curl pipe to sh — только для доверенных окружений
        const { stdout, stderr } = await execFileAsync(
          "sh",
          ["-c", "curl -fsSL https://opencode.ai/install | sh"],
          { timeout: 120_000 }
        );
        return { success: true, method: "curl", stdout: stdout.trim(), stderr: stderr.trim() };
      }
      return { success: false, error: `Неизвестный метод: ${method}. Используй npm или curl.` };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  // ── ACTION: update ──────────────────────────────────────────────────────────
  if (action === "update") {
    try {
      const { stdout, stderr } = await execFileAsync(
        "npm",
        ["install", "-g", "opencode-ai@latest"],
        { timeout: 120_000 }
      );
      return { success: true, stdout: stdout.trim(), stderr: stderr.trim() };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  // ── ACTION: configure ───────────────────────────────────────────────────────
  if (action === "configure") {
    const omnirouteUrl =
      (input["omniroute_url"] as string) ??
      process.env.OMNIROUTE_BASE_URL ??
      "http://localhost:20128";
    const omnirouteApiKey =
      (input["omniroute_api_key"] as string) ??
      process.env.OMNIROUTE_API_KEY ??
      "";
    const model = (input["model"] as string) ?? "cx/cost-optimizer";

    const configPath = getOpencodeConfigPath();
    const configDir = configPath.replace("/config.json", "");

    // Создать директорию если нет
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    // Читаем существующий конфиг если есть
    let existingConfig: Record<string, unknown> = {};
    if (existsSync(configPath)) {
      try {
        existingConfig = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
      } catch {
        // ignore
      }
    }

    const newConfig = {
      ...existingConfig,
      model,
      apiBase: `${omnirouteUrl}/v1`,
      apiKey: omnirouteApiKey || "omniroute-local",
      // Параметры для работы через OmniRoute
      temperature: 0,
      stream: true,
    };

    writeFileSync(configPath, JSON.stringify(newConfig, null, 2), "utf-8");

    return {
      success: true,
      configPath,
      config: {
        model: newConfig.model,
        apiBase: newConfig.apiBase,
        // Не возвращаем apiKey в ответе — только первые 8 символов
        apiKeyPreview: omnirouteApiKey
          ? `${omnirouteApiKey.substring(0, 8)}...`
          : "не задан",
      },
      message: `opencode настроен на OmniRoute (${omnirouteUrl}), модель: ${model}`,
    };
  }

  // ── ACTION: run ─────────────────────────────────────────────────────────────
  if (action === "run") {
    const bin = await findOpencodeBin();
    if (!bin) {
      return { success: false, error: "opencode не установлен. action=install" };
    }

    const task = (input["task"] as string) ?? "";
    const workdir = (input["workdir"] as string) ?? process.cwd();
    const model = (input["model"] as string) ?? undefined;
    const maxTokens = (input["max_tokens"] as number) ?? 4096;

    if (!task) {
      return { success: false, error: "Параметр 'task' обязателен для action=run" };
    }

    const args = ["run", "--print", task];
    if (model) args.push("--model", model);

    try {
      const { stdout, stderr } = await execFileAsync(bin, args, {
        cwd: workdir,
        timeout: 300_000, // 5 минут макс
        env: {
          ...process.env,
          OPENCODE_MAX_TOKENS: String(maxTokens),
        },
      });
      return {
        success: true,
        output: stdout.trim(),
        stderr: stderr.trim() || undefined,
        task,
        model: model ?? "default",
      };
    } catch (err) {
      return { success: false, error: String(err), task };
    }
  }

  // ── ACTION: list_models ─────────────────────────────────────────────────────
  if (action === "list_models") {
    const omnirouteUrl =
      process.env.OMNIROUTE_BASE_URL ?? "http://localhost:20128";
    const omnirouteApiKey = process.env.OMNIROUTE_API_KEY ?? "";

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (omnirouteApiKey) {
        headers["Authorization"] = `Bearer ${omnirouteApiKey}`;
      }

      const resp = await fetch(`${omnirouteUrl}/v1/models`, { headers });
      if (!resp.ok) {
        return { success: false, error: `HTTP ${resp.status}: ${await resp.text()}` };
      }
      const data = (await resp.json()) as { data?: Array<{ id: string }> };
      const models = data.data?.map((m) => m.id) ?? [];
      return {
        success: true,
        count: models.length,
        models,
        omnirouteUrl,
        hint: "Используй любой из этих model ID в action=configure или action=run",
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  return {
    error: `Неизвестный action: '${action}'. Доступные: status, install, update, configure, run, list_models`,
  };
};

// Метаданные скилла для регистрации
export const opencodeSkillMeta = {
  id: "opencode-manager",
  name: "OpenCode Manager",
  version: "1.0.0",
  description:
    "Настройка и управление opencode CLI. Установка, конфигурация через OmniRoute как провайдер, запуск задач, список моделей.",
  tags: ["cli", "opencode", "coding", "devops"],
  schema: {
    input: {
      action: {
        type: "string",
        enum: ["status", "install", "update", "configure", "run", "list_models"],
        description: "Действие",
      },
      method: { type: "string", description: "Метод установки: npm (default) | curl" },
      omniroute_url: { type: "string", description: "URL OmniRoute (default: http://localhost:20128)" },
      omniroute_api_key: { type: "string", description: "API ключ OmniRoute" },
      model: { type: "string", description: "Модель для opencode (default: cx/cost-optimizer)" },
      task: { type: "string", description: "Задача для action=run" },
      workdir: { type: "string", description: "Рабочая директория для action=run" },
      max_tokens: { type: "number", description: "Макс токенов для action=run" },
    },
    output: {
      success: { type: "boolean" },
      message: { type: "string" },
      error: { type: "string" },
    },
  },
};
