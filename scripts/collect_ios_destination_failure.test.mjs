import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.dirname(fileURLToPath(import.meta.url));
const collector = path.join(root, "collect_ios_destination_failure.mjs");
const runner = path.join(root, "run_v1_ui_smoke.sh");
const id = "B76CE387-1D78-4B37-AD14-4A9F67002B61";
function fixture(testExit, failDiagnostics = false, removeArtifacts = false) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "them-destination-test-"));
  const xcode = path.join(dir, "xcodebuild"), xcrun = path.join(dir, "xcrun"), calls = path.join(dir, "calls"), artifacts = path.join(dir, "artifacts");
  writeFileSync(xcode, `#!/bin/bash\nprintf '%s\\n' "$1" >> "$CALLS"\ncase "$1" in\n -version) ${failDiagnostics ? 'exit 3' : 'printf "Xcode 26.3\\nBuild version 17C529\\n"'} ;;\n -showdestinations) echo '{ platform:iOS Simulator, id:${id}, name:PRIVATE_DEVICE, error:runtime unavailable PRIVATE_SECRET }' ;;\n *) ${removeArtifacts ? 'rm -rf "$ARTIFACT_DIR";' : ""} exit ${testExit} ;;\nesac\n`);
  writeFileSync(xcrun, `#!/bin/bash\nprintf '%s\\n' "$*" >> "$CALLS"\ncase "$*" in\n 'simctl list devices available --json') echo '{"devices":{"com.apple.CoreSimulator.SimRuntime.iOS-26-2":[{"udid":"${id}","name":"PRIVATE_DEVICE","isAvailable":true}]}}' ;;\n 'simctl list devices --json') echo '{"devices":{"com.apple.CoreSimulator.SimRuntime.iOS-26-2":[{"udid":"${id}","name":"PRIVATE_DEVICE","state":"Booted","isAvailable":true},{"udid":"other","name":"PRIVATE_OTHER"}]}}' ;;\n 'simctl list runtimes --json') echo '{"runtimes":[{"identifier":"com.apple.CoreSimulator.SimRuntime.iOS-26-2","version":"26.2","isAvailable":false,"availabilityError":"runtime unavailable PRIVATE_SECRET"}]}' ;;\nesac\nexit 0\n`);
  chmodSync(xcode, 0o755); chmodSync(xcrun, 0o755);
  const res = spawnSync("bash", [runner], { encoding: "utf8", env: { ...process.env, CI: "", XCODEBUILD: xcode, XCRUN: xcrun, CALLS: calls, ARTIFACT_DIR: artifacts, IOS_SIMULATOR_DESTINATION: `platform=iOS Simulator,id=${id}` } });
  const reports = removeArtifacts ? [] : readdirSync(artifacts).filter(n => n.startsWith("v1-destination-failure-")).map(n => ({ content: readFileSync(path.join(artifacts,n), "utf8"), mode: statSync(path.join(artifacts,n)).mode & 0o777 }));
  const callsText = readFileSync(calls,"utf8"); rmSync(dir,{recursive:true,force:true});
  return {res,reports,callsText};
}
test("exit 70 preserves failure and collects only selected sanitized metadata", () => {
  const {res,reports,callsText} = fixture(70);
  assert.equal(res.status,70); assert.equal(reports.length,1); assert.equal(reports[0].mode,0o600);
  const data=JSON.parse(reports[0].content);
  assert.equal(data.triggeringExit,70); assert.equal(data.simulatorID,id); assert.equal(data.toolchain.xcodeVersion,"26.3");
  assert.equal(data.devices.selected.length,1); assert.equal(data.devices.selected[0].state,"Booted");
  assert.equal(data.runtimes.ios[0].unavailableReason,"runtime unavailable"); assert.equal(data.destinations.listed,true);
  assert.doesNotMatch(reports[0].content,/PRIVATE_DEVICE|PRIVATE_OTHER|PRIVATE_SECRET/);
  assert.equal(callsText.split("\n").filter(x=>x==="test").length,1);
  assert.equal(callsText.split("\n").filter(x=>x.startsWith("simctl erase ")).length,1);
});
test("other failures and success never collect diagnostics", () => {
  for (const code of [0,65]) { const {res,reports,callsText}=fixture(code); assert.equal(res.status,code); assert.equal(reports.length,0); assert.doesNotMatch(callsText,/-showdestinations|-version/); }
});
test("failed diagnostic leaves original exit unchanged", () => {
  const {res,reports}=fixture(70,true); assert.equal(res.status,70); assert.equal(JSON.parse(reports[0].content).toolchain.status,"failed");
});
test("a hung diagnostic is bounded and reports timeout", { timeout: 10000 }, () => {
  const dir=mkdtempSync(path.join(os.tmpdir(),"them-destination-timeout-"));
  try {
    const xcode=path.join(dir,"xcode"), xcrun=path.join(dir,"xcrun");
    writeFileSync(xcode, '#!/bin/bash\nif [[ "$1" == "-version" ]]; then sleep 20; else exit 0; fi\n');
    writeFileSync(xcrun, '#!/bin/bash\necho "{}"\n'); chmodSync(xcode,0o755); chmodSync(xcrun,0o755);
    const start=Date.now(); const res=spawnSync(process.execPath,[collector,xcode,xcrun,"project","scheme","Debug",id,dir],{encoding:"utf8",timeout:8000});
    assert.equal(res.status,0,res.stderr); assert.ok(Date.now()-start<7500); const f=readdirSync(dir).find(n=>n.startsWith("v1-destination-failure-"));
    assert.equal(JSON.parse(readFileSync(path.join(dir,f),"utf8")).toolchain.status,"timeout");
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test("collector write failure cannot replace original exit 70", () => { const {res}=fixture(70,false,true); assert.equal(res.status,70); });

test("hosted failure upload retains destination reports for V1 and voice", () => {
  const workflow=readFileSync(path.join(root,"..",".github","workflows","quality-gate.yml"),"utf8");
  assert.match(workflow,/them-v1-ui-smoke\/v1-destination-failure-\*\.json/);
  assert.match(workflow,/them-voice-network-fault-smokes\/v1-destination-failure-\*\.json/);
});
