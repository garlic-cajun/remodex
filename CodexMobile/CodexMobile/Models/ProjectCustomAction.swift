// FILE: ProjectCustomAction.swift
// Purpose: Models project-scoped custom actions exposed by the bridge.
// Layer: Model
// Exports: ProjectCustomActionType, ProjectCustomAction, ProjectCustomActionExecutionResult
// Depends on: Foundation, JSONValue

import Foundation

enum ProjectCustomActionType: String, Sendable {
    case runCommand = "run_command"
    case openURL = "open_url"
    case sendTmuxKeys = "send_tmux_keys"
}

struct ProjectCustomAction: Identifiable, Equatable, Sendable {
    let id: String
    let label: String
    let icon: String?
    let type: ProjectCustomActionType
    let confirmationRequired: Bool
    let isEnabled: Bool

    init?(from json: [String: JSONValue]) {
        let id = json["id"]?.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let label = json["label"]?.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let rawType = json["type"]?.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        guard !id.isEmpty,
              !label.isEmpty,
              let type = ProjectCustomActionType(rawValue: rawType) else {
            return nil
        }

        self.id = id
        self.label = label
        self.icon = json["icon"]?.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines)
        self.type = type
        self.confirmationRequired = json["confirmationRequired"]?.boolValue ?? false
        self.isEnabled = json["enabled"]?.boolValue ?? true
    }
}

struct ProjectCustomActionExecutionResult: Sendable {
    let success: Bool
    let actionId: String
    let actionType: ProjectCustomActionType
    let label: String
    let url: String?
    let stdout: String?
    let stderr: String?

    init?(from json: [String: JSONValue]) {
        let actionId = json["actionId"]?.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let label = json["label"]?.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let rawType = json["actionType"]?.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        guard !actionId.isEmpty,
              !label.isEmpty,
              let actionType = ProjectCustomActionType(rawValue: rawType) else {
            return nil
        }

        self.success = json["success"]?.boolValue ?? false
        self.actionId = actionId
        self.actionType = actionType
        self.label = label
        self.url = json["url"]?.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines)
        self.stdout = json["stdout"]?.stringValue
        self.stderr = json["stderr"]?.stringValue
    }
}
