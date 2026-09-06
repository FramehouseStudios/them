// D009 I4: moved verbatim out of RootExperienceView.swift (no behaviour change); raw fonts predate the design-system guard, see its allowlist.
import SwiftUI

struct TasksPanel: View {
    let onDone: () -> Void

    @State private var tasks: [BackendTaskItem] = []
    @State private var recap: BackendDailyRecapResponse?
    @State private var newTaskTitle = ""
    @State private var isLoading = false
    @State private var isSubmitting = false
    @State private var errorText = ""
    @FocusState private var newTaskFocused: Bool

    private var openTasks: [BackendTaskItem] {
        tasks.filter { $0.status == "open" }
    }

    private var completedTasks: [BackendTaskItem] {
        tasks.filter { $0.status == "completed" }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                LinearGradient(
                    gradient: Gradient(colors: [.herPeachTop, .herPeachMid, .herPeachBottom]),
                    startPoint: .top,
                    endPoint: .bottom
                )
                .ignoresSafeArea()

                VStack(spacing: 18) {
                    header
                    composer
                    if isLoading {
                        ProgressView().controlSize(.large)
                    } else {
                        taskList
                    }
                    Spacer(minLength: 0)
                }
                .padding(24)
            }
            .task {
                await reload()
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Tasks")
                    .font(.system(size: 30, weight: .semibold, design: .default))
                    .foregroundColor(.herText.opacity(0.95))
                Spacer()
                Button("Return", action: onDone)
                    .buttonStyle(.borderedProminent)
                    .tint(.white.opacity(0.22))
                    .foregroundColor(.herText.opacity(0.92))
            }

            if let recap {
                Text(recap.recap)
                    .font(.system(size: 14, weight: .regular, design: .default))
                    .foregroundColor(.herText.opacity(0.80))
                    .lineLimit(2)
            } else {
                Text("Capture tasks as you talk. io.them keeps open items and recap outcomes.")
                    .font(.system(size: 14, weight: .regular, design: .default))
                    .foregroundColor(.herText.opacity(0.80))
            }

            if !errorText.isEmpty {
                Text(errorText)
                    .font(.system(size: 13, weight: .regular, design: .default))
                    .foregroundColor(.red.opacity(0.9))
            }
        }
    }

    private var composer: some View {
        HStack(spacing: 10) {
            TextField("Add a task", text: $newTaskTitle)
                .textFieldStyle(.roundedBorder)
                .focused($newTaskFocused)
                .onSubmit {
                    Task { await addTask() }
                }
            Button {
                Task { await addTask() }
            } label: {
                Text(isSubmitting ? "Adding…" : "Add")
                    .font(.system(size: 14, weight: .semibold, design: .default))
            }
            .buttonStyle(.borderedProminent)
            .tint(.white.opacity(0.22))
            .disabled(isSubmitting || newTaskTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
    }

    private var taskList: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Open (\(openTasks.count))")
                    .font(.system(size: 15, weight: .semibold, design: .default))
                    .foregroundColor(.herText.opacity(0.9))
                if openTasks.isEmpty {
                    Text("No open tasks.")
                        .font(.system(size: 14, weight: .regular, design: .default))
                        .foregroundColor(.herText.opacity(0.70))
                } else {
                    ForEach(openTasks, id: \.id) { task in
                        taskRow(task, actionLabel: "Done", action: "complete")
                    }
                }

                Text("Completed (\(completedTasks.count))")
                    .font(.system(size: 15, weight: .semibold, design: .default))
                    .foregroundColor(.herText.opacity(0.9))
                    .padding(.top, 6)
                if completedTasks.isEmpty {
                    Text("No completed tasks yet.")
                        .font(.system(size: 14, weight: .regular, design: .default))
                        .foregroundColor(.herText.opacity(0.70))
                } else {
                    ForEach(completedTasks.prefix(12), id: \.id) { task in
                        taskRow(task, actionLabel: "Reopen", action: "reopen")
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 8)
        }
    }

    private func taskRow(_ task: BackendTaskItem, actionLabel: String, action: String) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(task.title)
                    .font(.system(size: 15, weight: .semibold, design: .default))
                    .foregroundColor(.herText.opacity(0.93))
                if task.dueAt > 0 {
                    Text("Due \(Date(timeIntervalSince1970: task.dueAt / 1000).formatted(date: .abbreviated, time: .shortened))")
                        .font(.system(size: 12, weight: .regular, design: .default))
                        .foregroundColor(.herText.opacity(0.74))
                }
            }
            Spacer(minLength: 0)
            Button(actionLabel) {
                Task { await mutateTask(action: action, taskID: task.id) }
            }
            .buttonStyle(.bordered)
            .tint(.white.opacity(0.22))
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.white.opacity(0.11))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color.white.opacity(0.16), lineWidth: 1)
        )
    }

    @MainActor
    private func reload() async {
        isLoading = true
        defer { isLoading = false }
        do {
            async let taskResult = BackendMemoryAPI.shared.fetchTasks(limit: 96, status: "all")
            async let recapResult = BackendMemoryAPI.shared.fetchDailyRecap()
            let tasksRead = try await taskResult
            let recapRead = try await recapResult
            tasks = tasksRead.payload.tasks
            recap = recapRead.payload
            errorText = ""
        } catch {
            errorText = error.localizedDescription
        }
    }

    @MainActor
    private func addTask() async {
        let title = newTaskTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return }
        isSubmitting = true
        defer { isSubmitting = false }
        do {
            _ = try await BackendMemoryAPI.shared.updateTask(
                action: "add",
                taskID: nil,
                title: title,
                query: nil,
                dueAt: nil,
                priority: "normal"
            )
            newTaskTitle = ""
            await reload()
        } catch {
            errorText = error.localizedDescription
        }
    }

    @MainActor
    private func mutateTask(action: String, taskID: String) async {
        isSubmitting = true
        defer { isSubmitting = false }
        do {
            _ = try await BackendMemoryAPI.shared.updateTask(
                action: action,
                taskID: taskID,
                title: nil,
                query: taskID,
                dueAt: nil,
                priority: nil
            )
            await reload()
        } catch {
            errorText = error.localizedDescription
        }
    }
}
