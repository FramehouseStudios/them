import SwiftUI
import ScreenplayStudio

/// Edit the script's title page: title, credit, writer, source, draft date and
/// contact, with a live miniature of the printed page. Saving writes the
/// Fountain title page into the top of the draft, so it saves, syncs and
/// exports with the pages.
struct ScreenplayTitlePageSheet: View {
    let existing: ScreenplayTitlePage?
    let projectTitle: String
    let writerName: String
    let onSave: (ScreenplayTitlePage) -> Void
    let onRemove: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var page = ScreenplayTitlePage()
    @State private var didLoad = false

    static let creditChoices = ["Written by", "Screenplay by", "Teleplay by", "Story by"]

    /// A new title page starts from what the app already knows: the project's
    /// title, the name the writer gave, and today's date. An existing page is
    /// shown exactly as written.
    static func startingPage(existing: ScreenplayTitlePage?, projectTitle: String, writerName: String, today: Date = Date()) -> ScreenplayTitlePage {
        if let existing { return existing }
        let title = projectTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        let placeholderTitles: Set<String> = ["Live Draft", "Screenplay Studio"]
        return ScreenplayTitlePage(
            title: placeholderTitles.contains(title) ? "" : title,
            author: writerName.trimmingCharacters(in: .whitespacesAndNewlines),
            draftDate: today.formatted(date: .long, time: .omitted)
        )
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    preview
                    fields
                    if existing != nil {
                        Button(role: .destructive) {
                            onRemove()
                            dismiss()
                        } label: {
                            Text("Remove title page")
                                .font(IOThemTypography.UI.callout)
                        }
                        .accessibilityIdentifier("studio.title-page.remove")
                    }
                }
                .padding(20)
            }
            .navigationTitle("Title Page")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        onSave(page)
                        dismiss()
                    }
                    .disabled(page.isEmpty)
                    .accessibilityIdentifier("studio.title-page.save")
                }
            }
        }
        .onAppear {
            guard !didLoad else { return }
            didLoad = true
            page = Self.startingPage(existing: existing, projectTitle: projectTitle, writerName: writerName)
        }
    }

    private var preview: some View {
        let blocks = ScreenplayPrintService.titlePageBlocks(for: page)
        return VStack(spacing: 0) {
            Spacer(minLength: 0)
            VStack(spacing: 10) {
                if blocks.centered.isEmpty {
                    Text("Your title")
                        .foregroundColor(.black.opacity(0.28))
                } else {
                    ForEach(Array(blocks.centered.enumerated()), id: \.offset) { index, line in
                        Text(line)
                            .underline(index == 0 && !page.title.isEmpty)
                    }
                }
            }
            .multilineTextAlignment(.center)
            Spacer(minLength: 0)
            HStack(alignment: .bottom) {
                Text(blocks.contact)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 8)
                Text(blocks.draftDate)
            }
            .font(IOThemTypography.Screenplay.titlePagePreviewFootnote)
        }
        .font(IOThemTypography.Screenplay.titlePagePreview)
        .foregroundColor(.black)
        .padding(18)
        .frame(width: 204, height: 264) // 8.5 × 11 at 24 pt per inch
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
        .shadow(color: .black.opacity(0.14), radius: 8, x: 0, y: 4)
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Title page preview")
    }

    private var fields: some View {
        VStack(alignment: .leading, spacing: 14) {
            field("Title", text: $page.title, prompt: "The Long Night", id: "title")

            VStack(alignment: .leading, spacing: 6) {
                label("Credit")
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(Self.creditChoices, id: \.self) { choice in
                            let selected = page.credit == choice
                            Button {
                                page.credit = choice
                            } label: {
                                Text(choice)
                                    .font(IOThemTypography.UI.caption)
                                    .foregroundColor(.herText.opacity(selected ? 0.96 : 0.78))
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 7)
                                    .background(Capsule().fill(Color.herText.opacity(selected ? 0.16 : 0.06)))
                                    .overlay(Capsule().stroke(Color.herText.opacity(selected ? 0.40 : 0.14), lineWidth: 1))
                            }
                            .buttonStyle(.plain)
                            .accessibilityAddTraits(selected ? .isSelected : [])
                        }
                    }
                }
            }

            field("Writer", text: $page.author, prompt: "Your name", id: "author")
            field("Based on", text: $page.source, prompt: "Optional — e.g. Based on the novel by…", id: "source")

            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    label("Draft date")
                    Spacer()
                    Button("Today") {
                        page.draftDate = Date().formatted(date: .long, time: .omitted)
                    }
                    .font(IOThemTypography.UI.caption)
                }
                TextField("September 28, 2026", text: $page.draftDate)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityIdentifier("studio.title-page.draftDate")
            }

            VStack(alignment: .leading, spacing: 6) {
                label("Contact")
                TextField("Email, phone or agent", text: $page.contact, axis: .vertical)
                    .lineLimit(2...4)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityIdentifier("studio.title-page.contact")
            }
        }
    }

    private func field(_ title: String, text: Binding<String>, prompt: String, id: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            label(title)
            TextField(prompt, text: text)
                .textFieldStyle(.roundedBorder)
                .accessibilityIdentifier("studio.title-page.\(id)")
        }
    }

    private func label(_ text: String) -> some View {
        Text(text)
            .font(IOThemTypography.UI.captionStrong)
            .foregroundColor(.herText.opacity(0.82))
    }
}

extension View {
    /// Presents the title page sheet for the open draft. `onDraftChanged`
    /// hands the updated draft to the live editor after a save or removal.
    func studioTitlePageSheet(
        isPresented: Binding<Bool>,
        vm: ScreenplayStudioViewModel,
        projectTitle: String,
        onDraftChanged: @escaping (String) -> Void
    ) -> some View {
        sheet(isPresented: isPresented) {
            ScreenplayTitlePageSheet(
                existing: vm.titlePage,
                projectTitle: projectTitle,
                writerName: HerEvolutionStore.shared.preferredName,
                onSave: { page in
                    vm.applyTitlePage(page)
                    onDraftChanged(vm.fountainDraft)
                },
                onRemove: {
                    vm.applyTitlePage(ScreenplayTitlePage(credit: ""))
                    onDraftChanged(vm.fountainDraft)
                }
            )
        }
    }
}
