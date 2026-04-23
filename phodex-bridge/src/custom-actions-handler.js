// FILE: custom-actions-handler.js
// Purpose: Serves project-scoped custom mobile actions and executes allowlisted local commands.
// Layer: Bridge handler
// Exports: handleCustomActionsRequest
// Depends on: child_process, fs, path, os

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const DEFAULT_ACTIONS_CONFIG_FILE_NAMES = [
  ".remodex-actions.json",
  ".remodex/actions.json",
];
const ACTION_TIMEOUT_MS = 90_000;

function handleCustomActionsRequest(rawMessage, sendResponse, options = {}) {
  let parsed;
  try {
    parsed = JSON.parse(rawMessage);
  } catch {
    return false;
  }

  const method = typeof parsed?.method === "string" ? parsed.method.trim() : "";
  if (!method.startsWith("customActions/")) {
    return false;
  }

  const id = parsed.id;
  const params = parsed.params || {};
  const logger = options.logger || console;

  handleCustomActionsMethod(method, params, {
    ...options,
    logger,
  })
    .then((result) => {
      sendResponse(JSON.stringify({ id, result }));
    })
    .catch((err) => {
      const errorCode = err.errorCode || "custom_actions_error";
      const message = err.userMessage || err.message || "Unknown custom action error";
      sendResponse(
        JSON.stringify({
          id,
          error: {
            code: -32000,
            message,
            data: { errorCode },
          },
        })
      );
    });

  return true;
}

async function handleCustomActionsMethod(method, params, options = {}) {
  const cwd = await resolveCustomActionsCwd(params);
  const context = await loadProjectActionsContext(cwd, options);

  switch (method) {
    case "customActions/list":
      return buildCustomActionsListResult(context);
    case "customActions/run":
      return runProjectCustomAction(context, params, options);
    default:
      throw customActionsError("unknown_method", `Unknown custom action method: ${method}`);
  }
}

function buildCustomActionsListResult(context) {
  return {
    projectRoot: context.projectRoot,
    configPath: context.configPath,
    actions: context.actions.map((action) => ({
      id: action.id,
      label: action.label,
      icon: action.icon,
      type: action.type,
      confirmationRequired: Boolean(action.confirmationRequired),
      enabled: Boolean(action.enabled),
    })),
  };
}

async function runProjectCustomAction(context, params, options = {}) {
  const actionId = readString(params.actionId) || readString(params.action_id);
  if (!actionId) {
    throw customActionsError("missing_action_id", "customActions/run requires an actionId.");
  }

  const action = context.actions.find((candidate) => candidate.id === actionId);
  if (!action) {
    throw customActionsError("action_not_found", `No enabled project action found for id '${actionId}'.`);
  }

  if (action.confirmationRequired && params.confirm !== "run_project_action") {
    throw customActionsError(
      "confirmation_required",
      "This action requires params.confirm === \"run_project_action\"."
    );
  }

  options.logger?.info?.(
    `[remodex] custom action run id=${action.id} type=${action.type} project=${context.projectRoot}`
  );

  switch (action.type) {
    case "open_url":
      return {
        success: true,
        actionId: action.id,
        actionType: action.type,
        label: action.label,
        url: action.url,
      };
    case "run_command": {
      const commandResult = await executeShellCommand(action.command, {
        cwd: context.projectRoot,
        timeoutMs: action.timeoutMs,
      });
      return {
        success: commandResult.exitCode === 0,
        actionId: action.id,
        actionType: action.type,
        label: action.label,
        exitCode: commandResult.exitCode,
        stdout: commandResult.stdout,
        stderr: commandResult.stderr,
      };
    }
    case "send_tmux_keys": {
      const command = buildTmuxSendKeysCommand(action);
      const commandResult = await executeShellCommand(command, {
        cwd: context.projectRoot,
        timeoutMs: action.timeoutMs,
      });
      return {
        success: commandResult.exitCode === 0,
        actionId: action.id,
        actionType: action.type,
        label: action.label,
        exitCode: commandResult.exitCode,
        stdout: commandResult.stdout,
        stderr: commandResult.stderr,
      };
    }
    default:
      throw customActionsError("unsupported_action_type", `Unsupported custom action type '${action.type}'.`);
  }
}

async function loadProjectActionsContext(cwd, options = {}) {
  const projectRoot = await resolveRepoRoot(cwd).catch(() => cwd);
  const config = readProjectActionsConfig(projectRoot, options);
  const actions = normalizeProjectActions(config.actions, { projectRoot });
  return {
    projectRoot,
    configPath: config.configPath,
    actions,
  };
}

function readProjectActionsConfig(projectRoot, options = {}) {
  const fsImpl = options.fsImpl || fs;
  const explicitConfigPath = readString(options.actionsConfigPath)
    || readString(process.env.REMODEX_PROJECT_ACTIONS_CONFIG);
  const candidatePaths = explicitConfigPath
    ? [explicitConfigPath]
    : DEFAULT_ACTIONS_CONFIG_FILE_NAMES.map((relativePath) => path.join(projectRoot, relativePath));

  for (const candidatePath of candidatePaths) {
    if (!fsImpl.existsSync(candidatePath)) {
      continue;
    }

    try {
      const parsed = JSON.parse(fsImpl.readFileSync(candidatePath, "utf8"));
      return {
        configPath: candidatePath,
        actions: Array.isArray(parsed?.actions) ? parsed.actions : [],
      };
    } catch (error) {
      throw customActionsError(
        "invalid_actions_config",
        `Could not parse custom actions config at ${candidatePath}: ${error.message}`
      );
    }
  }

  return {
    configPath: null,
    actions: [],
  };
}

function normalizeProjectActions(rawActions, context = {}) {
  const actions = [];
  const seenIds = new Set();

  for (const rawAction of Array.isArray(rawActions) ? rawActions : []) {
    if (!rawAction || typeof rawAction !== "object") {
      continue;
    }

    const enabled = rawAction.enabled !== false;
    if (!enabled) {
      continue;
    }

    const id = readString(rawAction.id);
    const label = readString(rawAction.label);
    const type = readString(rawAction.type);
    if (!id || !label || !type || seenIds.has(id)) {
      continue;
    }

    const normalizedBase = {
      id,
      label,
      icon: readString(rawAction.icon) || readString(rawAction.systemImage) || null,
      type,
      enabled,
      confirmationRequired: Boolean(rawAction.confirmationRequired),
      timeoutMs: normalizeTimeoutMs(rawAction.timeoutMs),
    };

    if (type === "run_command") {
      const command = readString(rawAction.command);
      if (!command) {
        continue;
      }
      actions.push({
        ...normalizedBase,
        command,
      });
      seenIds.add(id);
      continue;
    }

    if (type === "open_url") {
      const url = readString(rawAction.url);
      if (!url || !isAllowedOpenUrl(url)) {
        continue;
      }
      actions.push({
        ...normalizedBase,
        url,
      });
      seenIds.add(id);
      continue;
    }

    if (type === "send_tmux_keys") {
      const tmuxTarget = readString(rawAction.tmuxTarget) || "expo";
      const keys = normalizeTmuxKeys(rawAction.keys);
      if (!keys.length) {
        continue;
      }
      actions.push({
        ...normalizedBase,
        tmuxTarget,
        keys,
      });
      seenIds.add(id);
      continue;
    }

    context.logger?.warn?.(`[remodex] ignored unsupported custom action type: ${type}`);
  }

  return actions;
}

function normalizeTmuxKeys(rawValue) {
  if (Array.isArray(rawValue)) {
    return rawValue
      .map((value) => readString(value))
      .filter(Boolean);
  }

  const singleKey = readString(rawValue);
  if (!singleKey) {
    return [];
  }

  return [singleKey];
}

function buildTmuxSendKeysCommand(action) {
  const target = shellQuote(action.tmuxTarget);
  const keys = action.keys.map((key) => shellQuote(key)).join(" ");
  return `tmux send-keys -t ${target} ${keys}`;
}

function normalizeTimeoutMs(rawValue) {
  const parsed = Number.parseInt(String(rawValue ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return ACTION_TIMEOUT_MS;
  }
  return Math.min(parsed, 5 * 60_000);
}

function isAllowedOpenUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "exp:";
  } catch {
    return false;
  }
}

function shellQuote(value) {
  const stringValue = String(value);
  return `'${stringValue.replace(/'/g, `'"'"'`)}'`;
}

function executeShellCommand(command, options = {}) {
  const cwd = options.cwd;
  const timeoutMs = options.timeoutMs || ACTION_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const child = spawn("/bin/bash", ["-lc", command], {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill("SIGTERM");
      reject(customActionsError("action_timeout", "Custom action timed out before completion."));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      reject(customActionsError("action_launch_failed", error.message || "Failed to launch custom action."));
    });

    child.on("close", (exitCode) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      const normalizedExitCode = Number.isInteger(exitCode) ? exitCode : 1;
      if (normalizedExitCode !== 0) {
        reject(customActionsError(
          "action_failed",
          stderr.trim() || stdout.trim() || `Custom action exited with status ${normalizedExitCode}.`
        ));
        return;
      }
      resolve({
        exitCode: normalizedExitCode,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
  });
}

async function resolveCustomActionsCwd(params) {
  const requestedCwd = firstNonEmptyString([params.cwd, params.currentWorkingDirectory]);

  if (!requestedCwd) {
    throw customActionsError(
      "missing_working_directory",
      "Custom actions require a bound local working directory."
    );
  }

  if (!isExistingDirectory(requestedCwd)) {
    throw customActionsError(
      "missing_working_directory",
      "The requested local working directory does not exist on this Mac."
    );
  }

  return requestedCwd;
}

async function resolveRepoRoot(cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || "Failed to resolve git repo root."));
        return;
      }

      const repoRoot = stdout.trim();
      if (!repoRoot) {
        reject(new Error("Git repo root is empty."));
        return;
      }

      resolve(repoRoot);
    });
  });
}

function firstNonEmptyString(candidates) {
  for (const candidate of candidates) {
    const value = readString(candidate);
    if (value) {
      return value;
    }
  }
  return null;
}

function readString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function isExistingDirectory(candidatePath) {
  try {
    return fs.statSync(candidatePath).isDirectory();
  } catch {
    return false;
  }
}

function customActionsError(errorCode, userMessage) {
  const error = new Error(userMessage);
  error.errorCode = errorCode;
  error.userMessage = userMessage;
  return error;
}

module.exports = {
  handleCustomActionsRequest,
  __test: {
    normalizeProjectActions,
    buildTmuxSendKeysCommand,
    isAllowedOpenUrl,
    readProjectActionsConfig,
  },
};
