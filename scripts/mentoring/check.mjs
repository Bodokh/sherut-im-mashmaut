import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { constants } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(new URL("../../package.json", import.meta.url));

function installedBin(packageName, relativePath) {
  return path.join(path.dirname(require.resolve(`${packageName}/package.json`)), relativePath);
}

function runStep({ name, args }) {
  console.log(`[check:mentoring] ${name}`);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (code) => {
      if (settled) return;
      settled = true;
      resolve(code);
    };
    let child;
    try {
      child = spawn(process.execPath, args, { cwd: root, stdio: "inherit", shell: false });
    } catch (error) {
      console.error(`[check:mentoring] Could not start ${name}: ${error.message}`);
      finish(1);
      return;
    }
    child.once("error", (error) => {
      console.error(`[check:mentoring] Could not start ${name}: ${error.message}`);
      finish(1);
    });
    child.once("close", (code, signal) => {
      if (signal) console.error(`[check:mentoring] ${name} stopped by ${signal}.`);
      finish(code ?? (signal ? 128 + (constants.signals[signal] ?? 1) : 1));
    });
  });
}

async function main() {
  if (process.argv.length > 2) throw new Error("check:mentoring does not accept arguments.");
  // Fixed local checks only: no package installation, build, server, migration,
  // integration suite, environment-file loader, or provider configuration.
  const steps = [
    { name: "Mentoring unit tests", args: [fileURLToPath(new URL("./test-unit.mjs", import.meta.url))] },
    { name: "Whole-repository ESLint", args: [installedBin("eslint", "bin/eslint.js"), "."] },
    { name: "Next route type generation", args: [installedBin("next", "dist/bin/next"), "typegen"] },
    { name: "TypeScript", args: [installedBin("typescript", "bin/tsc"), "--noEmit", "--pretty", "false"] },
  ];
  for (const step of steps) {
    const code = await runStep(step);
    if (code !== 0) {
      console.error(`[check:mentoring] Stopped after ${step.name} (exit ${code}).`);
      process.exitCode = code;
      return;
    }
  }
  console.log("[check:mentoring] All local quality checks passed.");
}

main().catch((error) => {
  console.error(`[check:mentoring] ${error.message}`);
  process.exitCode = 1;
});
