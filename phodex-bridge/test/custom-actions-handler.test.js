// FILE: custom-actions-handler.test.js
// Purpose: Covers project-scoped custom action listing and execution safety checks.
// Layer: Unit test

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { handleCustomActionsRequest } = require("../src/custom-actions-handler");

function makeTempProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "remodex-custom-actions-"));
}

async function waitForResponses(responses, expectedLength) {
  const startedAt = Date.now();
  while (responses.length < expectedLength && Date.now() - startedAt < 2_000) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test("customActions/list reads enabled project-scoped actions from config", async () => {
  const projectDir = makeTempProject();
  const responses = [];

  try {
    fs.writeFileSync(path.join(projectDir, ".remodex-actions.json"), JSON.stringify({
      actions: [
        {
          id: "reload_expo",
          label: "Reload Expo",
          icon: "arrow.clockwise",
          type: "send_tmux_keys",
          tmuxTarget: "expo",
          keys: ["r", "C-m"],
          enabled: true,
        },
      ],
    }, null, 2));

    const handled = handleCustomActionsRequest(JSON.stringify({
      id: "list-1",
      method: "customActions/list",
      params: { cwd: projectDir },
    }), (rawResponse) => {
      responses.push(JSON.parse(rawResponse));
    });

    assert.equal(handled, true);
    await waitForResponses(responses, 1);

    assert.equal(responses.length, 1);
    assert.equal(responses[0].result.actions[0].id, "reload_expo");
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("customActions/run returns open_url payload for configured action", async () => {
  const projectDir = makeTempProject();
  const responses = [];

  try {
    fs.writeFileSync(path.join(projectDir, ".remodex-actions.json"), JSON.stringify({
      actions: [
        {
          id: "open_preview",
          label: "Open Preview",
          type: "open_url",
          url: "exp://100.64.10.8:19000",
          enabled: true,
        },
      ],
    }, null, 2));

    handleCustomActionsRequest(JSON.stringify({
      id: "run-1",
      method: "customActions/run",
      params: { cwd: projectDir, actionId: "open_preview" },
    }), (rawResponse) => {
      responses.push(JSON.parse(rawResponse));
    });

    await waitForResponses(responses, 1);
    assert.equal(responses.length, 1);
    assert.equal(responses[0].result.actionType, "open_url");
    assert.equal(responses[0].result.url, "exp://100.64.10.8:19000");
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test("customActions/run rejects confirmation-required action without confirm token", async () => {
  const projectDir = makeTempProject();
  const responses = [];

  try {
    fs.writeFileSync(path.join(projectDir, ".remodex-actions.json"), JSON.stringify({
      actions: [
        {
          id: "restart_expo",
          label: "Restart Expo",
          type: "run_command",
          command: "echo restarted",
          confirmationRequired: true,
          enabled: true,
        },
      ],
    }, null, 2));

    handleCustomActionsRequest(JSON.stringify({
      id: "run-2",
      method: "customActions/run",
      params: { cwd: projectDir, actionId: "restart_expo" },
    }), (rawResponse) => {
      responses.push(JSON.parse(rawResponse));
    });

    await waitForResponses(responses, 1);
    assert.equal(responses.length, 1);
    assert.equal(responses[0].error.data.errorCode, "confirmation_required");
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});
