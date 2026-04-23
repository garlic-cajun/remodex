// FILE: ProjectCustomActionsService.swift
// Purpose: Fetches and executes project-scoped custom actions via bridge JSON-RPC.
// Layer: Service
// Exports: ProjectCustomActionsService, ProjectCustomActionsError
// Depends on: Foundation, CodexService, ProjectCustomAction

import Foundation

enum ProjectCustomActionsError: LocalizedError {
    case disconnected
    case invalidResponse
    case invalidURL
    case bridgeError(code: String?, message: String?)

    var errorDescription: String? {
        switch self {
        case .disconnected:
            return "Not connected to bridge."
        case .invalidResponse:
            return "Invalid response from bridge."
        case .invalidURL:
            return "This action returned an invalid URL."
        case .bridgeError(_, let message):
            return message ?? "Custom action failed."
        }
    }
}

@MainActor
final class ProjectCustomActionsService {
    private let codex: CodexService
    private let workingDirectory: String?

    init(codex: CodexService, workingDirectory: String?) {
        self.codex = codex
        self.workingDirectory = Self.normalizedWorkingDirectory(workingDirectory)
    }

    func listActions() async throws -> [ProjectCustomAction] {
        let json = try await request(method: "customActions/list")
        return json["actions"]?.arrayValue?.compactMap { value in
            guard let object = value.objectValue else { return nil }
            return ProjectCustomAction(from: object)
        } ?? []
    }

    func runAction(actionID: String, confirmed: Bool) async throws -> ProjectCustomActionExecutionResult {
        var params: [String: JSONValue] = [
            "actionId": .string(actionID),
        ]
        if confirmed {
            params["confirm"] = .string("run_project_action")
        }

        let json = try await request(method: "customActions/run", params: params)
        guard let result = ProjectCustomActionExecutionResult(from: json) else {
            throw ProjectCustomActionsError.invalidResponse
        }

        return result
    }

    private func request(method: String, params: [String: JSONValue] = [:]) async throws -> [String: JSONValue] {
        guard let workingDirectory else {
            throw ProjectCustomActionsError.bridgeError(
                code: "missing_working_directory",
                message: "The selected local folder is not available on this Mac."
            )
        }

        var scopedParams = params
        scopedParams["cwd"] = .string(workingDirectory)

        do {
            let response = try await codex.sendRequest(method: method, params: .object(scopedParams))
            guard let resultObj = response.result?.objectValue else {
                throw ProjectCustomActionsError.invalidResponse
            }
            return resultObj
        } catch let error as CodexServiceError {
            switch error {
            case .disconnected:
                throw ProjectCustomActionsError.disconnected
            case .rpcError(let rpcError):
                let errorCode = rpcError.data?.objectValue?["errorCode"]?.stringValue
                throw ProjectCustomActionsError.bridgeError(code: errorCode, message: rpcError.message)
            default:
                throw ProjectCustomActionsError.bridgeError(code: nil, message: error.errorDescription)
            }
        }
    }

    private static func normalizedWorkingDirectory(_ rawValue: String?) -> String? {
        guard let rawValue else { return nil }
        let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
