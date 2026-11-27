import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const rootScript = process.argv[2] || "test:smoke:steps";
const commands = [];
const failures = [];

function expandScript(name, stack = []) {
  if (stack.includes(name)) {
    throw new Error("Circular npm test script: " + [...stack, name].join(" -> "));
  }

  const source = packageJson.scripts?.[name];
  assert.equal(typeof source, "string", "Unknown npm test script: " + name);

  for (const part of source.split(/\s+&&\s+/).map(value => value.trim()).filter(Boolean)) {
    const nested = part.match(/^npm run ([A-Za-z0-9:_-]+)$/);
    if (nested) {
      expandScript(nested[1], [...stack, name]);
      continue;
    }

    const command = part.match(/^node\s+([^\s]+)$/);
    assert.ok(command, "Unsupported smoke command in " + name + ": " + part);
    commands.push({ script: name, file: command[1] });
  }
}

expandScript(rootScript);
console.log("DOWNTIME smoke suite: " + commands.length + " checks will run in the existing order.");

for (let index = 0; index < commands.length; index++) {
  const { script, file } = commands[index];
  console.log("\n[" + (index + 1) + "/" + commands.length + "] " + script + " → " + file);

  const result = spawnSync(process.execPath, [file], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  if (result.error || result.status !== 0) {
    failures.push({
      script,
      file,
      status: result.status,
      signal: result.signal,
      error: result.error?.message || null,
    });
    console.error("FAILED: " + file);
  }
}

console.log("\nDOWNTIME smoke suite completed: " + (commands.length - failures.length) + "/" + commands.length + " checks passed.");

if (failures.length) {
  console.error("\nFailed checks:");
  for (const failure of failures) {
    const reason = failure.status === null ? "signal: " + failure.signal : "exit: " + failure.status;
    console.error("- " + failure.file + " [" + reason + "]");
    if (failure.error) console.error("  " + failure.error);
  }
  process.exitCode = 1;
} else {
  console.log("All DOWNTIME smoke checks passed.");
}
