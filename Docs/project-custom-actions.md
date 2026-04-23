# Project-scoped custom actions (mobile → Mac bridge)

Remodex supports **project-scoped custom actions** so the iOS app can trigger local workflows on your paired Mac bridge.

## Config location

For each project, create one of these files at the project root:

- `.remodex-actions.json` (recommended)
- `.remodex/actions.json`

The bridge resolves actions from the active thread `cwd`, prefers the git repo root when available, and only executes actions defined in that project file.

## Supported action types (v1)

- `run_command` — run a project-defined shell command on the Mac bridge
- `open_url` — return a project-defined URL so iOS opens it natively
- `send_tmux_keys` — send allowlisted keys into a tmux target session

## Example config

```json
{
  "actions": [
    {
      "id": "reload_expo",
      "label": "Reload Expo",
      "icon": "arrow.clockwise",
      "type": "send_tmux_keys",
      "tmuxTarget": "expo",
      "keys": ["r", "C-m"],
      "confirmationRequired": false,
      "enabled": true
    },
    {
      "id": "restart_expo",
      "label": "Restart Expo",
      "icon": "arrow.triangle.2.circlepath",
      "type": "run_command",
      "command": "tmux send-keys -t expo C-c C-m && npx expo start --dev-client --lan",
      "confirmationRequired": true,
      "enabled": true
    },
    {
      "id": "open_expo_preview",
      "label": "Open Preview",
      "icon": "iphone",
      "type": "open_url",
      "url": "exp://100.64.10.8:19000",
      "confirmationRequired": false,
      "enabled": true
    },
    {
      "id": "open_phoenix_preview",
      "label": "Open Preview",
      "icon": "safari",
      "type": "open_url",
      "url": "http://100.64.10.9:4000",
      "confirmationRequired": false,
      "enabled": true
    }
  ]
}
```

## How the three workflow actions behave

- **Reload Expo**: typically mapped to `send_tmux_keys` with target `expo` and keys `["r", "C-m"]`.
- **Restart Expo**: typically mapped to `run_command`, e.g. `tmux send-keys -t expo C-c C-m && npx expo start --dev-client --lan`.
- **Open Preview**: mapped to `open_url` and opened on iOS with native URL handling (`http(s)://` or `exp://`).

## Safety model

- iOS sends only an `actionId`; it does **not** send raw shell commands.
- Bridge executes only enabled actions found in the active project config.
- `confirmationRequired: true` actions require explicit confirmation from iOS.
- `open_url` is constrained to `http`, `https`, and `exp` schemes in v1.
