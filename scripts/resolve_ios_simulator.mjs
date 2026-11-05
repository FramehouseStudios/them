import fs from "node:fs";

// Resolve once before any erasure. Xcode must receive the same immutable ID,
// not a name it can independently resolve to another installed runtime.
try {
  const requested = process.argv[2] || "";
  const ci = process.argv[3] === "true";
  const options = new Map();
  for (const part of requested.split(",").filter(Boolean)) {
    const split = part.indexOf("=");
    const key = part.slice(0, split).trim();
    const value = part.slice(split + 1).trim();
    if (split < 1 || !value || options.has(key) ||
        !["platform", "id", "name", "OS", "arch"].includes(key)) {
      throw new Error("Invalid or duplicate simulator destination option.");
    }
    options.set(key, value);
  }
  if (requested && options.get("platform") !== "iOS Simulator") {
    throw new Error("Destination must be an iOS Simulator.");
  }
  if (options.has("id") && options.has("name")) {
    throw new Error("Select a simulator by ID or name, not both.");
  }
  if (requested && !options.has("id") && !options.has("name")) {
    throw new Error("Cannot resolve the simulator UDID; specify id= or name=.");
  }
  if (!requested && !ci) throw new Error("Select an explicit task-owned simulator.");
  const inventory = JSON.parse(fs.readFileSync(0, "utf8"));
  if (!inventory.devices || typeof inventory.devices !== "object") {
    throw new Error("Simulator inventory is missing devices.");
  }
  const devices = Object.entries(inventory.devices).flatMap(([runtime, entries]) => {
    const version = runtime.match(/\.iOS-(\d+(?:-\d+)*)$/)?.[1]?.replaceAll("-", ".");
    return version && Array.isArray(entries)
      ? entries.filter(d => d.isAvailable === true && typeof d.udid === "string")
        .map(d => ({...d, version})) : [];
  });
  let matches = devices.filter(d => options.has("id")
    ? d.udid.toLowerCase() === options.get("id").toLowerCase()
    : options.has("name") ? d.name === options.get("name") : d.name?.startsWith("iPhone"));
  const os = options.get("OS");
  // CI's automatic choice exercises the newest installed iOS, rather than
  // sidestepping a newer-runtime failure by falling back to the first row.
  if (os === "latest" || !requested) {
    const latest = matches.map(d => d.version).sort((a, b) => a.localeCompare(b, "en", {numeric: true})).at(-1);
    matches = matches.filter(d => d.version === latest);
  } else if (os) {
    matches = matches.filter(d => d.version === os);
  }
  if (!matches.length) throw new Error("No available iOS simulator matches the requested destination.");
  if (requested && matches.length !== 1) {
    throw new Error("Ambiguous simulator name; select an exact id= or add OS=.");
  }
  const arch = options.get("arch");
  if (arch && !["arm64", "x86_64"].includes(arch)) throw new Error("Unsupported simulator architecture.");
  console.log(`platform=iOS Simulator,id=${matches[0].udid}${arch ? `,arch=${arch}` : ""}`);
} catch (error) {
  console.error(`run-v1-ui-smoke: ${error.message}`);
  process.exitCode = 2;
}
