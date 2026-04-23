// FILE: TurnProjectActionsToolbar.swift
// Purpose: Renders a compact toolbar menu for project-scoped custom actions.
// Layer: View Component
// Exports: TurnProjectActionsToolbarButton
// Depends on: SwiftUI, ProjectCustomAction

import SwiftUI

struct TurnProjectActionsToolbarButton: View {
    let actions: [ProjectCustomAction]
    let runningActionID: String?
    let succeededActionID: String?
    let isEnabled: Bool
    let onSelect: (ProjectCustomAction) -> Void

    var body: some View {
        Menu {
            ForEach(actions) { action in
                Button {
                    HapticFeedback.shared.triggerImpactFeedback(style: .light)
                    onSelect(action)
                } label: {
                    Label {
                        Text(action.label)
                    } icon: {
                        Image(systemName: action.icon ?? defaultIcon(for: action.type))
                    }
                }
                .disabled(!isEnabled || runningActionID != nil)
            }
        } label: {
            if let runningActionID,
               actions.contains(where: { $0.id == runningActionID }) {
                ProgressView()
                    .controlSize(.small)
                    .frame(width: 24, height: 24)
            } else if let succeededActionID,
                      actions.contains(where: { $0.id == succeededActionID }) {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.green)
                    .frame(width: 24, height: 24)
            } else {
                Image(systemName: "bolt.horizontal.circle")
                    .foregroundStyle(.primary)
                    .frame(width: 24, height: 24)
            }
        }
        .buttonStyle(.plain)
        .contentShape(Circle())
        .adaptiveToolbarItem(in: Circle())
        .accessibilityLabel("Project actions")
    }

    private func defaultIcon(for type: ProjectCustomActionType) -> String {
        switch type {
        case .runCommand:
            return "terminal"
        case .openURL:
            return "safari"
        case .sendTmuxKeys:
            return "keyboard"
        }
    }
}
