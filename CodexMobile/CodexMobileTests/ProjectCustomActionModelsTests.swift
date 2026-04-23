// FILE: ProjectCustomActionModelsTests.swift
// Purpose: Verifies decode behavior for project-scoped custom action model payloads.
// Layer: Unit test
// Exports: ProjectCustomActionModelsTests
// Depends on: XCTest, JSONValue, ProjectCustomAction

import XCTest
@testable import CodexMobile

final class ProjectCustomActionModelsTests: XCTestCase {
    func testProjectCustomActionDecodesRequiredFields() {
        let action = ProjectCustomAction(from: [
            "id": .string("reload_expo"),
            "label": .string("Reload Expo"),
            "icon": .string("arrow.clockwise"),
            "type": .string("send_tmux_keys"),
            "confirmationRequired": .bool(false),
            "enabled": .bool(true),
        ])

        XCTAssertEqual(action?.id, "reload_expo")
        XCTAssertEqual(action?.label, "Reload Expo")
        XCTAssertEqual(action?.type, .sendTmuxKeys)
    }

    func testProjectCustomActionExecutionResultDecodesOpenURLPayload() {
        let result = ProjectCustomActionExecutionResult(from: [
            "success": .bool(true),
            "actionId": .string("open_preview"),
            "actionType": .string("open_url"),
            "label": .string("Open Preview"),
            "url": .string("exp://100.100.100.100:19000"),
        ])

        XCTAssertEqual(result?.actionType, .openURL)
        XCTAssertEqual(result?.url, "exp://100.100.100.100:19000")
    }
}
