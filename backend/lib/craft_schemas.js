// JSON Schema (draft-07) definitions for the craft analysis contract.
// Single source of truth — endpoints, tests, and external clients
// validate against the same schema documents.
//
// The shapes mirror them/ScreenplayCraftModels.swift exactly. The one
// CodingKey rename (Swift `overrideRecord` -> JSON `"override"`) is
// reflected in the MajorTurn schema property name below.
//
// Optional Swift fields are absent from `required` arrays; clients
// must accept omitted keys (no null serialization).

const CRAFT_SCHEMA_VERSION = 1;

const PAGE_RANGE_SCHEMA = Object.freeze({
  type: "object",
  required: ["start", "end"],
  properties: {
    start: { type: "integer", minimum: 1 },
    end:   { type: "integer", minimum: 1 },
  },
  additionalProperties: false,
});

const EVIDENCE_SCHEMA = Object.freeze({
  type: "object",
  required: ["id", "excerpt"],
  properties: {
    id:         { type: "string", minLength: 1 },
    sceneId:    { type: "string" },
    sceneTitle: { type: "string" },
    page:       { type: "integer", minimum: 1 },
    lineStart:  { type: "integer", minimum: 1 },
    lineEnd:    { type: "integer", minimum: 1 },
    excerpt:    { type: "string", minLength: 1 },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
  additionalProperties: false,
});

const TURN_OVERRIDE_SCHEMA = Object.freeze({
  type: "object",
  required: ["id", "turnId", "action"],
  properties: {
    id:        { type: "string", minLength: 1 },
    turnId:    { type: "string", minLength: 1 },
    action:    { type: "string", minLength: 1 },
    reason:    { type: "string" },
    sceneId:   { type: "string" },
    page:      { type: "integer", minimum: 1 },
    userId:    { type: "string" },
    createdAt: { type: "string" },
    expiresAt: { type: "string" },
  },
  additionalProperties: false,
});

const BEAT_DEFINITION_SCHEMA = Object.freeze({
  type: "object",
  required: ["id", "label", "required"],
  properties: {
    id:                { type: "string", minLength: 1 },
    label:             { type: "string", minLength: 1 },
    summary:           { type: "string" },
    expectedPageRange: PAGE_RANGE_SCHEMA,
    required:          { type: "boolean" },
    majorTurnId:       { type: "string" },
  },
  additionalProperties: false,
});

const BEAT_SCHEMA = Object.freeze({
  type: "object",
  required: ["id", "label", "status", "evidence"],
  properties: {
    id:                   { type: "string", minLength: 1 },
    frameworkBeatId:      { type: "string" },
    label:                { type: "string", minLength: 1 },
    summary:              { type: "string" },
    expectedPageRange:    PAGE_RANGE_SCHEMA,
    actualPageRange:      PAGE_RANGE_SCHEMA,
    sceneId:              { type: "string" },
    sceneTitle:           { type: "string" },
    status:               { type: "string", minLength: 1 },
    confidence:           { type: "number", minimum: 0, maximum: 1 },
    classificationSource: { type: "string" },
    evidence:             { type: "array", items: EVIDENCE_SCHEMA },
    majorTurnId:          { type: "string" },
  },
  additionalProperties: false,
});

const BEAT_SHEET_SCHEMA = Object.freeze({
  type: "object",
  required: ["id", "frameworkId", "title", "beats"],
  properties: {
    id:          { type: "string", minLength: 1 },
    frameworkId: { type: "string", minLength: 1 },
    title:       { type: "string", minLength: 1 },
    beats:       { type: "array", items: BEAT_SCHEMA },
  },
  additionalProperties: false,
});

const MAJOR_TURN_SCHEMA = Object.freeze({
  type: "object",
  required: ["id", "turnId", "label", "required", "status", "detected", "evidence"],
  properties: {
    id:                { type: "string", minLength: 1 },
    turnId:            { type: "string", minLength: 1 },
    label:             { type: "string", minLength: 1 },
    required:          { type: "boolean" },
    expectedPage:      { type: "integer", minimum: 1 },
    expectedPageRange: PAGE_RANGE_SCHEMA,
    actualPage:        { type: "integer", minimum: 1 },
    actualPageRange:   PAGE_RANGE_SCHEMA,
    sceneId:           { type: "string" },
    sceneTitle:        { type: "string" },
    status:            { type: "string", minLength: 1 },
    detected:          { type: "boolean" },
    driftPages:        { type: "integer" },
    confidence:        { type: "number", minimum: 0, maximum: 1 },
    evidence:          { type: "array", items: EVIDENCE_SCHEMA },
    // JSON key is "override" (Swift property is overrideRecord).
    override:          TURN_OVERRIDE_SCHEMA,
  },
  additionalProperties: false,
});

const TURN_DRIFT_SCHEMA = Object.freeze({
  type: "object",
  required: ["id", "turnId", "label", "status"],
  properties: {
    id:           { type: "string", minLength: 1 },
    turnId:       { type: "string", minLength: 1 },
    label:        { type: "string", minLength: 1 },
    expectedPage: { type: "integer", minimum: 1 },
    actualPage:   { type: "integer", minimum: 1 },
    driftPages:   { type: "integer" },
    status:       { type: "string", minLength: 1 },
  },
  additionalProperties: false,
});

const DRIFT_REPORT_SCHEMA = Object.freeze({
  type: "object",
  required: ["status", "timeline"],
  properties: {
    status:   { type: "string", minLength: 1 },
    summary:  { type: "string" },
    timeline: { type: "array", items: TURN_DRIFT_SCHEMA },
  },
  additionalProperties: false,
});

const COVERAGE_SCHEMA = Object.freeze({
  type: "object",
  required: [
    "requiredMajorTurnCount",
    "detectedMajorTurnCount",
    "overriddenMajorTurnCount",
    "missingMajorTurnCount",
    "complete",
  ],
  properties: {
    requiredMajorTurnCount:   { type: "integer", minimum: 0 },
    detectedMajorTurnCount:   { type: "integer", minimum: 0 },
    overriddenMajorTurnCount: { type: "integer", minimum: 0 },
    missingMajorTurnCount:    { type: "integer", minimum: 0 },
    complete:                 { type: "boolean" },
    confidence:               { type: "number", minimum: 0, maximum: 1 },
  },
  additionalProperties: false,
});

const FRAMEWORK_REFERENCE_SCHEMA = Object.freeze({
  type: "object",
  required: ["id", "title"],
  properties: {
    id:      { type: "string", minLength: 1 },
    title:   { type: "string", minLength: 1 },
    version: { type: "string" },
  },
  additionalProperties: false,
});

const CRAFT_CITATION_SCHEMA = Object.freeze({
  type: "object",
  required: ["id", "cardId", "title", "source", "principle"],
  properties: {
    id:        { type: "string", minLength: 1 },
    cardId:    { type: "string", minLength: 1 },
    title:     { type: "string", minLength: 1 },
    source:    { type: "string", minLength: 1 },
    principle: { type: "string", minLength: 1 },
  },
  additionalProperties: false,
});

const CRAFT_NOTE_SCHEMA = Object.freeze({
  type: "object",
  required: ["id", "page", "lineStart", "lineEnd", "craftArea", "title", "body", "severity"],
  properties: {
    id:        { type: "string", minLength: 1 },
    page:      { type: "integer", minimum: 1 },
    lineStart: { type: "integer", minimum: 1 },
    lineEnd:   { type: "integer", minimum: 1 },
    craftArea: { type: "string", minLength: 1 },
    title:     { type: "string", minLength: 1 },
    body:      { type: "string", minLength: 1 },
    severity:  { type: "string", minLength: 1 },
    cardId:    { type: "string" },
    citation:  { type: "string" },
  },
  additionalProperties: false,
});

const FORMATTING_WARNING_SCHEMA = Object.freeze({
  type: "object",
  required: ["id", "page", "lineStart", "lineEnd", "severity", "craftArea", "title", "body"],
  properties: {
    id:        { type: "string", minLength: 1 },
    page:      { type: "integer", minimum: 1 },
    lineStart: { type: "integer", minimum: 1 },
    lineEnd:   { type: "integer", minimum: 1 },
    severity:  { type: "string", minLength: 1 },
    craftArea: { type: "string", minLength: 1 },
    title:     { type: "string", minLength: 1 },
    body:      { type: "string", minLength: 1 },
    cardId:    { type: "string" },
    citation:  { type: "string" },
  },
  additionalProperties: false,
});

const GENRE_DOCTOR_PASS_SCHEMA = Object.freeze({
  type: "object",
  required: ["id", "genre", "title", "body", "craftArea", "cardIds", "citations"],
  properties: {
    id:        { type: "string", minLength: 1 },
    genre:     { type: "string", minLength: 1 },
    title:     { type: "string", minLength: 1 },
    body:      { type: "string", minLength: 1 },
    craftArea: { type: "string", minLength: 1 },
    cardIds:   { type: "array", items: { type: "string" } },
    citations: { type: "array", items: CRAFT_CITATION_SCHEMA },
  },
  additionalProperties: false,
});

const SNAPSHOT_REFERENCE_SCHEMA = Object.freeze({
  type: "object",
  required: ["id", "projectId", "versionId", "reportId", "frameworkId"],
  properties: {
    id:          { type: "string", minLength: 1 },
    projectId:   { type: "string", minLength: 1 },
    versionId:   { type: "string", minLength: 1 },
    reportId:    { type: "string", minLength: 1 },
    frameworkId: { type: "string", minLength: 1 },
    createdAt:   { type: "string" },
  },
  additionalProperties: false,
});

const FRAMEWORK_SCHEMA = Object.freeze({
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://io.them/schemas/craft/framework.json",
  type: "object",
  required: ["id", "title", "requiredMajorTurnIds", "beats"],
  properties: {
    id:                   { type: "string", minLength: 1 },
    title:                { type: "string", minLength: 1 },
    summary:              { type: "string" },
    version:              { type: "string" },
    requiredMajorTurnIds: { type: "array", items: { type: "string", minLength: 1 } },
    beats:                { type: "array", items: BEAT_DEFINITION_SCHEMA, minItems: 1 },
  },
  additionalProperties: false,
});

const REPORT_SCHEMA = Object.freeze({
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://io.them/schemas/craft/report.json",
  type: "object",
  required: [
    "id",
    "schemaVersion",
    "projectId",
    "framework",
    "coverage",
    "beatSheet",
    "majorTurns",
    "drift",
    "overrides",
  ],
  properties: {
    id:               { type: "string", minLength: 1 },
    schemaVersion:    { type: "integer", const: CRAFT_SCHEMA_VERSION },
    projectId:        { type: "string", minLength: 1 },
    versionId:        { type: "string" },
    screenplayTitle:  { type: "string" },
    generatedAt:      { type: "string" },
    generatedBy:      { type: "string" },
    framework:        FRAMEWORK_REFERENCE_SCHEMA,
    pageCount:        { type: "integer", minimum: 1 },
    summary:          { type: "string" },
    coverage:         COVERAGE_SCHEMA,
    beatSheet:        BEAT_SHEET_SCHEMA,
    majorTurns:       { type: "array", items: MAJOR_TURN_SCHEMA },
    drift:            DRIFT_REPORT_SCHEMA,
    overrides:        { type: "array", items: TURN_OVERRIDE_SCHEMA },
    snapshot:         SNAPSHOT_REFERENCE_SCHEMA,
    craftNotes:       { type: "array", items: CRAFT_NOTE_SCHEMA },
    formattingWarnings: { type: "array", items: FORMATTING_WARNING_SCHEMA },
    genreDoctorPasses:  { type: "array", items: GENRE_DOCTOR_PASS_SCHEMA },
    citationSources:    { type: "array", items: CRAFT_CITATION_SCHEMA },
  },
  additionalProperties: false,
});

const ERROR_ENVELOPE_SCHEMA = Object.freeze({
  $schema: "http://json-schema.org/draft-07/schema#",
  $id: "https://io.them/schemas/craft/error.json",
  type: "object",
  required: ["error"],
  properties: {
    error:   { type: "string", minLength: 1 },
    message: { type: "string" },
  },
  additionalProperties: false,
});

// Tiny, dependency-free JSON Schema validator covering the subset
// used by the craft schemas. Returns { valid, errors }. We avoid
// pulling in ajv to keep backend deps lean for T18; real validation
// rigor for evals can adopt ajv in T21 if needed.
function validateAgainstSchema(value, schema, path = "$") {
  const errors = [];
  const visit = (val, sch, p) => {
    if (sch === PAGE_RANGE_SCHEMA && val && typeof val === "object" && val.start > val.end) {
      errors.push(`${p}: PageRange.start (${val.start}) must be <= end (${val.end})`);
    }
    if (sch.const !== undefined && val !== sch.const) {
      errors.push(`${p}: expected const ${JSON.stringify(sch.const)} got ${JSON.stringify(val)}`);
    }
    const t = sch.type;
    if (t === "object") {
      if (val === null || typeof val !== "object" || Array.isArray(val)) {
        errors.push(`${p}: expected object`);
        return;
      }
      for (const key of sch.required || []) {
        if (!Object.prototype.hasOwnProperty.call(val, key)) {
          errors.push(`${p}: missing required key "${key}"`);
        }
      }
      const props = sch.properties || {};
      for (const key of Object.keys(val)) {
        if (props[key]) {
          visit(val[key], props[key], `${p}.${key}`);
        } else if (sch.additionalProperties === false) {
          errors.push(`${p}: unexpected key "${key}"`);
        }
      }
    } else if (t === "array") {
      if (!Array.isArray(val)) {
        errors.push(`${p}: expected array`);
        return;
      }
      if (sch.minItems !== undefined && val.length < sch.minItems) {
        errors.push(`${p}: array length ${val.length} < minItems ${sch.minItems}`);
      }
      if (sch.items) {
        val.forEach((item, idx) => visit(item, sch.items, `${p}[${idx}]`));
      }
    } else if (t === "string") {
      if (typeof val !== "string") {
        errors.push(`${p}: expected string`);
        return;
      }
      if (sch.minLength !== undefined && val.length < sch.minLength) {
        errors.push(`${p}: string length ${val.length} < minLength ${sch.minLength}`);
      }
    } else if (t === "integer") {
      if (typeof val !== "number" || !Number.isInteger(val)) {
        errors.push(`${p}: expected integer`);
        return;
      }
      if (sch.minimum !== undefined && val < sch.minimum) {
        errors.push(`${p}: ${val} < minimum ${sch.minimum}`);
      }
    } else if (t === "number") {
      if (typeof val !== "number") {
        errors.push(`${p}: expected number`);
        return;
      }
      if (sch.minimum !== undefined && val < sch.minimum) errors.push(`${p}: ${val} < minimum ${sch.minimum}`);
      if (sch.maximum !== undefined && val > sch.maximum) errors.push(`${p}: ${val} > maximum ${sch.maximum}`);
    } else if (t === "boolean") {
      if (typeof val !== "boolean") errors.push(`${p}: expected boolean`);
    }
  };
  visit(value, schema, path);
  return { valid: errors.length === 0, errors };
}

export {
  CRAFT_SCHEMA_VERSION,
  PAGE_RANGE_SCHEMA,
  EVIDENCE_SCHEMA,
  TURN_OVERRIDE_SCHEMA,
  BEAT_DEFINITION_SCHEMA,
  BEAT_SCHEMA,
  BEAT_SHEET_SCHEMA,
  MAJOR_TURN_SCHEMA,
  TURN_DRIFT_SCHEMA,
  DRIFT_REPORT_SCHEMA,
  COVERAGE_SCHEMA,
  FRAMEWORK_REFERENCE_SCHEMA,
  SNAPSHOT_REFERENCE_SCHEMA,
  CRAFT_CITATION_SCHEMA,
  CRAFT_NOTE_SCHEMA,
  FORMATTING_WARNING_SCHEMA,
  GENRE_DOCTOR_PASS_SCHEMA,
  FRAMEWORK_SCHEMA,
  REPORT_SCHEMA,
  ERROR_ENVELOPE_SCHEMA,
  validateAgainstSchema,
};
