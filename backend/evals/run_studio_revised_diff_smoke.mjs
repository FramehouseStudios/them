function normalizeSnippet(value, maxLength = 180) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return text.slice(0, maxLength);
}

function normalizeStoredScreenplayThreadViewState(entry) {
  if (!entry || typeof entry !== "object") return null;
  const searchText = normalizeSnippet(entry.searchText ?? entry.search_text, 220);
  const selectedFilterRaw = normalizeSnippet(entry.selectedFilterRaw ?? entry.selected_filter_raw, 48);
  const selectedSceneKey = normalizeSnippet(entry.selectedSceneKey ?? entry.selected_scene_key, 180);
  const scrollTargetKey = normalizeSnippet(entry.scrollTargetKey ?? entry.scroll_target_key, 180);
  const focusedDiffKey = normalizeSnippet(entry.focusedDiffKey ?? entry.focused_diff_key, 180);
  const collapsedSectionKeys = Array.isArray(entry.collapsedSectionKeys ?? entry.collapsed_section_keys)
    ? [...new Set((entry.collapsedSectionKeys ?? entry.collapsed_section_keys)
      .map((item) => normalizeSnippet(item, 180))
      .filter(Boolean))]
      .slice(0, 48)
    : [];
  if (!searchText && !selectedFilterRaw && !selectedSceneKey && !scrollTargetKey && !focusedDiffKey && collapsedSectionKeys.length === 0) {
    return null;
  }
  return {
    searchText: searchText || "",
    selectedFilterRaw: selectedFilterRaw || "",
    selectedSceneKey: selectedSceneKey || "",
    scrollTargetKey: scrollTargetKey || "",
    collapsedSectionKeys,
    focusedDiffKey: focusedDiffKey || "",
  };
}

function normalizeStoredScreenplayDiffAcknowledgedKeys(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(
    list
      .map((item) => normalizeSnippet(item, 180))
      .filter(Boolean)
      .map((item) => item.toLowerCase())
  )].slice(0, 48);
}

function normalizeStoredScreenplayDiffAcknowledgedEntries(list) {
  if (!Array.isArray(list)) return [];
  const entries = [];
  const seen = new Set();
  for (const item of list) {
    const raw = item && typeof item === "object" ? item : {};
    const key = normalizeSnippet(raw.key ?? raw.persistentKey ?? item, 180)?.toLowerCase() || "";
    if (!key || seen.has(key)) continue;
    entries.push({
      key,
      fingerprint: normalizeSnippet(raw.fingerprint ?? raw.currentFingerprint ?? raw.current_fingerprint, 320) || "",
    });
    seen.add(key);
  }
  return entries.slice(0, 48);
}

function normalizeStoredScreenplayDiffAcknowledgementState(entry) {
  const raw = entry && typeof entry === "object" ? entry : {};
  const entries = normalizeStoredScreenplayDiffAcknowledgedEntries(raw.entries);
  const keys = normalizeStoredScreenplayDiffAcknowledgedKeys(raw.keys);
  const mergedEntries = [...entries];
  const seen = new Set(mergedEntries.map((item) => item.key));
  for (const key of keys) {
    if (seen.has(key)) continue;
    mergedEntries.push({ key, fingerprint: "" });
    seen.add(key);
  }
  return {
    keys: mergedEntries.map((item) => item.key).slice(0, 48),
    entries: mergedEntries.slice(0, 48),
  };
}

function toScreenplayThreadViewStatePayload(state) {
  const safeState = normalizeStoredScreenplayThreadViewState(state);
  if (!safeState) return null;
  return {
    search_text: safeState.searchText || "",
    selected_filter_raw: safeState.selectedFilterRaw || "",
    selected_scene_key: safeState.selectedSceneKey || "",
    scroll_target_key: safeState.scrollTargetKey || "",
    collapsed_section_keys: Array.isArray(safeState.collapsedSectionKeys) ? safeState.collapsedSectionKeys : [],
    focused_diff_key: safeState.focusedDiffKey || "",
  };
}

function toScreenplayDiffAcknowledgedPayload(entries, keys) {
  const safeState = normalizeStoredScreenplayDiffAcknowledgementState({ entries, keys });
  return {
    keys: safeState.keys,
    entries: safeState.entries.map((item) => ({
      key: item.key,
      fingerprint: item.fingerprint || "",
    })),
  };
}

function normalizeExcerpt(value) {
  return String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function focusedPageDiffOverlayWidth(snapshot) {
  if (!snapshot) return 480;
  const available = Math.max(280, snapshot.visibleRect.width - 28);
  return Math.min(520, available);
}

function focusedPageDiffOverlayX(snapshot) {
  if (!snapshot) return 18;
  const width = focusedPageDiffOverlayWidth(snapshot);
  const preferred = snapshot.rect.minX + 14;
  const maxX = Math.max(12, snapshot.visibleRect.width - width - 12);
  return Math.min(Math.max(12, preferred), maxX);
}

function focusedPageDiffOverlayY(snapshot) {
  if (!snapshot) return 16;
  const preferred = snapshot.rect.minY + 8;
  const maxY = Math.max(12, snapshot.visibleRect.height - 250);
  return Math.min(Math.max(12, preferred), maxY);
}

function focusedPageDiffConnectorLayout(snapshot, overlayWidth, overlayX, overlayY) {
  if (!snapshot) return null;
  const maxX = Math.max(18, snapshot.visibleRect.width - 18);
  const maxY = Math.max(18, snapshot.visibleRect.height - 18);
  const anchor = {
    x: Math.min(Math.max(18, snapshot.rect.minX - 10), maxX),
    y: Math.min(Math.max(18, snapshot.rect.midY), maxY),
  };
  const attachesOnLeadingEdge = overlayX >= anchor.x;
  const cardAttach = {
    x: attachesOnLeadingEdge
      ? Math.max(18, overlayX - 10)
      : Math.min(maxX, overlayX + overlayWidth + 10),
    y: Math.min(Math.max(18, overlayY + 42), maxY),
  };
  const elbowX = attachesOnLeadingEdge
    ? Math.max(anchor.x + 18, cardAttach.x - 52)
    : Math.min(anchor.x - 18, cardAttach.x + 52);
  return {
    anchor,
    elbow: {
      x: Math.min(Math.max(18, elbowX), maxX),
      y: cardAttach.y,
    },
    cardAttach,
  };
}

function refreshAcknowledgedDiffRecords(acknowledgedRecords, exchanges) {
  const trackedKeys = new Set([
    ...Object.keys(acknowledgedRecords || {}),
  ]);
  const result = {};
  for (const exchange of exchanges) {
    if (!trackedKeys.has(exchange.persistentKey)) continue;
    if (exchange.target !== "page") continue;
    const currentFingerprint = normalizeExcerpt(exchange.currentDraftText);
    if (!currentFingerprint) continue;
    const storedFingerprint = String(acknowledgedRecords[exchange.persistentKey] ?? "").trim();
    if (!storedFingerprint || storedFingerprint === currentFingerprint) {
      result[exchange.persistentKey] = currentFingerprint;
    }
  }
  return result;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const diffKey = "project_motel|turn-204|write-77";
const ownerProject = {
  id: "project_motel",
  title: "Night Check-In",
  studioThreadViewState: {
    searchText: " revised write ",
    selectedFilterRaw: "currentScene",
    selectedSceneKey: "scene:int.motel.room-night",
    scrollTargetKey: diffKey,
    collapsedSectionKeys: ["scene:lobby", "scene:lobby", "scene:hallway"],
    focusedDiffKey: diffKey,
  },
  studioDiffAcknowledgedKeys: [
    diffKey,
    "PROJECT_MOTEL|TURN-204|WRITE-77",
    "",
  ],
  studioDiffAcknowledgedEntries: [
    {
      key: diffKey,
      fingerprint: normalizeExcerpt("He closes the door softly behind him, listening for movement in the hall."),
    },
    {
      key: "PROJECT_MOTEL|TURN-204|WRITE-77",
      fingerprint: "",
    },
  ],
};

const revisedExchange = {
  persistentKey: diffKey,
  backendThreadID: "turn-204",
  writeID: "write-77",
  target: "page",
  sceneLabel: "INT. MOTEL ROOM - NIGHT",
  insertedText: "He closes the door softly behind him.",
  currentDraftText: "He closes the door softly behind him, listening for movement in the hall.",
};

assert(
  revisedExchange.insertedText !== revisedExchange.currentDraftText,
  "Smoke setup requires a revised page write"
);

const backendPayload = {
  id: ownerProject.id,
  title: ownerProject.title,
  studio_thread_view_state: toScreenplayThreadViewStatePayload(ownerProject.studioThreadViewState),
  studio_diff_acknowledged: toScreenplayDiffAcknowledgedPayload(
    ownerProject.studioDiffAcknowledgedEntries,
    ownerProject.studioDiffAcknowledgedKeys
  ),
};

const storedJson = JSON.stringify(backendPayload);
const restoredPayload = JSON.parse(storedJson);

const restoredThreadViewState = normalizeStoredScreenplayThreadViewState(restoredPayload.studio_thread_view_state);
const restoredAcknowledgedState = normalizeStoredScreenplayDiffAcknowledgementState(
  restoredPayload.studio_diff_acknowledged
);
const restoredAcknowledgedKeys = restoredAcknowledgedState.keys;
const restoredAcknowledgedEntries = restoredAcknowledgedState.entries;

assert(restoredThreadViewState, "Expected thread view state to survive storage");
assert(restoredThreadViewState.focusedDiffKey === diffKey, "Focused diff key did not round-trip");
assert(restoredThreadViewState.scrollTargetKey === diffKey, "Scroll target key did not round-trip");
assert(
  restoredThreadViewState.collapsedSectionKeys.length === 2,
  "Collapsed scene sections should be deduped and preserved"
);
assert(
  restoredAcknowledgedKeys.length === 1 && restoredAcknowledgedKeys[0] === diffKey,
  "Acknowledged diff keys did not round-trip cleanly"
);
assert(
  restoredAcknowledgedEntries.length === 1
  && restoredAcknowledgedEntries[0].key === diffKey
  && restoredAcknowledgedEntries[0].fingerprint === normalizeExcerpt(revisedExchange.currentDraftText),
  "Acknowledged diff fingerprint did not round-trip cleanly"
);

const restoredHistory = [
  {
    id: "exchange-revised",
    persistentKey: diffKey,
    target: "page",
    insertedText: revisedExchange.insertedText,
    currentDraftText: revisedExchange.currentDraftText,
  },
  {
    id: "exchange-note",
    persistentKey: "project_motel|turn-205|pin-1",
    target: "voicePin",
    insertedText: "",
    currentDraftText: "",
  },
];

const focusedExchange = restoredHistory.find((item) => item.persistentKey === restoredThreadViewState.focusedDiffKey);
assert(focusedExchange, "Focused diff entry did not restore against thread history");
assert(focusedExchange.target === "page", "Focused diff should restore to a page write");
assert(focusedExchange.insertedText === revisedExchange.insertedText, "Original inserted text changed during restore");
assert(
  focusedExchange.currentDraftText === revisedExchange.currentDraftText,
  "Current draft comparison text changed during restore"
);
assert(
  restoredAcknowledgedKeys.includes(focusedExchange.persistentKey.toLowerCase()),
  "Keep Current acknowledgement should survive relaunch restore"
);

const changedDraftFingerprint = normalizeExcerpt(
  "He closes the door softly behind him, then freezes as footsteps stop outside."
);
assert(
  restoredAcknowledgedEntries[0].fingerprint !== changedDraftFingerprint,
  "Smoke setup requires the revised block to change again"
);
const refreshedAcknowledgements = refreshAcknowledgedDiffRecords(
  { [diffKey]: restoredAcknowledgedEntries[0].fingerprint },
  [
    {
      persistentKey: diffKey,
      target: "page",
      currentDraftText: "He closes the door softly behind him, then freezes as footsteps stop outside.",
    },
  ]
);
assert(
  !Object.prototype.hasOwnProperty.call(refreshedAcknowledgements, diffKey),
  "Keep Current acknowledgement should expire when the page block changes again"
);

const narrowSnapshot = {
  rect: { minX: 78, minY: 96, midY: 124 },
  visibleRect: { width: 360, height: 420 },
};
const wideSnapshot = {
  rect: { minX: 212, minY: 140, midY: 176 },
  visibleRect: { width: 900, height: 720 },
};

for (const snapshot of [narrowSnapshot, wideSnapshot]) {
  const overlayWidth = focusedPageDiffOverlayWidth(snapshot);
  const overlayX = focusedPageDiffOverlayX(snapshot);
  const overlayY = focusedPageDiffOverlayY(snapshot);
  const connector = focusedPageDiffConnectorLayout(snapshot, overlayWidth, overlayX, overlayY);
  assert(connector, "Expected connector layout for anchored diff overlay");
  assert(overlayX >= 12, "Overlay should stay within the leading editor inset");
  assert(overlayX + overlayWidth <= snapshot.visibleRect.width - 12 + 0.001, "Overlay should stay within the trailing editor inset");
  assert(overlayY >= 12, "Overlay should stay within the top editor inset");
  assert(connector.anchor.x >= 18 && connector.anchor.x <= snapshot.visibleRect.width - 18, "Connector anchor should stay inside the visible editor");
  assert(connector.cardAttach.y === connector.elbow.y, "Connector elbow and card attach should stay aligned");
}

console.log("studio-revised-diff-smoke: ok");
