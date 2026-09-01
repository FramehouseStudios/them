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

import Ajv from "ajv";

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
    projectId: { type: "string", minLength: 1 },
    versionId: { type: "string", minLength: 1 },
    frameworkId: { type: "string", minLength: 1 },
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
    unavailableMajorTurnCount:{ type: "integer", minimum: 0 },
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

// AJV validates the complete draft-07 contract without coercing, defaulting,
// stripping, or otherwise mutating production values. PageRange ordering is a
// semantic invariant outside plain JSON Schema, so it remains an explicit pass.
const ajv = new Ajv({
  allErrors: true,
  strict: true,
  coerceTypes: false,
  useDefaults: false,
  removeAdditional: false,
});
const compiledValidators = new WeakMap();

function formatAjvError(error, rootPath) {
  const instancePath = String(error?.instancePath || "").replaceAll("/", ".");
  const base = `${rootPath}${instancePath}`;
  if (error?.keyword === "required") {
    return `${base}: [required] missing required key "${error.params?.missingProperty}"`;
  }
  if (error?.keyword === "additionalProperties") {
    return `${base}: [additionalProperties] unexpected key "${error.params?.additionalProperty}"`;
  }
  return `${base}: [${error?.keyword || "schema"}] ${error?.message || "validation failed"}`;
}

function collectPageRangeErrors(value, schema, path, errors) {
  if (!schema || value === undefined || value === null) return;
  if (
    schema === PAGE_RANGE_SCHEMA
    && typeof value === "object"
    && !Array.isArray(value)
    && Number.isInteger(value.start)
    && Number.isInteger(value.end)
    && value.start > value.end
  ) {
    errors.push(`${path}: PageRange.start (${value.start}) must be <= end (${value.end})`);
  }
  if (schema.type === "object" && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, childSchema] of Object.entries(schema.properties || {})) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        collectPageRangeErrors(value[key], childSchema, `${path}.${key}`, errors);
      }
    }
  } else if (schema.type === "array" && Array.isArray(value) && schema.items) {
    value.forEach((item, index) => collectPageRangeErrors(item, schema.items, `${path}[${index}]`, errors));
  }
}

function validateAgainstSchema(value, schema, path = "$") {
  let validator = compiledValidators.get(schema);
  if (!validator) {
    validator = ajv.compile(schema);
    compiledValidators.set(schema, validator);
  }
  const valid = validator(value);
  const errors = valid ? [] : (validator.errors || []).map((error) => formatAjvError(error, path));
  collectPageRangeErrors(value, schema, path, errors);
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
  FRAMEWORK_SCHEMA,
  REPORT_SCHEMA,
  ERROR_ENVELOPE_SCHEMA,
  validateAgainstSchema,
};
