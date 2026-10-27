import { readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return collect(target);
    return entry.name.endsWith(".test.mjs") && !entry.name.endsWith(".integration.test.mjs") ? [target] : [];
  }));
  return files.flat();
}
const files = (await Promise.all(["tests/mentoring", "components/mentoring"].map((folder) => collect(path.join(root, folder))))).flat().sort();
if (!files.length) throw new Error("No mentoring unit tests found.");
// Server-only modules need React's server condition; client controller tests
// need the normal React hooks. Keep both groups isolated in native processes.
const clientFiles = files.filter((file) => file.includes(`${path.sep}offline${path.sep}`) || file.includes(`${path.sep}components${path.sep}`));
const serverFiles = files.filter((file) => !clientFiles.includes(file));
for (const [group, selected] of [["client", clientFiles], ["server", serverFiles]]) {
  if (!selected.length) continue;
  const args = [...(group === "server" ? ["--conditions=react-server"] : []), "--import", "./tests/mentoring/server/typescript-loader.mjs", "--experimental-strip-types", "--test", ...selected];
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: root, stdio: "inherit", env: { ...process.env, MENTORING_INTEGRATION_TESTS: "0" } });
    child.once("error", () => { console.error(`Unable to start ${group} mentoring tests.`); resolve(1); });
    child.once("exit", (status) => resolve(status ?? 1));
  });
  if (code !== 0) process.exitCode = 1;
}
