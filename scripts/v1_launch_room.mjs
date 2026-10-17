#!/usr/bin/env node
// Compatibility entrypoint; the Codex-only workflow has one canonical owner.
import { runWorkflowCli } from "./codex_workflow.mjs";
runWorkflowCli();
