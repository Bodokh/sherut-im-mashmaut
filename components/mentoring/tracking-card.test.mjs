import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import * as trackingState from "./tracking-state.ts";
import * as staffHost from "../../lib/staff-host.ts";

function components(file, snapshot) {
  const jsx = (type, props) => ({ type, props });
  const compiled = ts.transpileModule(readFileSync(new URL(`./${file}.tsx`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)((id) => {
    if (id === "react") return { useState: (value) => [value, () => {}] };
    if (id === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (id === "@/lib/mentoring/workspace-client") return { useWorkspace: () => ({ snapshot }) };
    if (id === "@/lib/staff-host") return staffHost;
    if (id === "next/link") return { default: "Link" };
    if (id === "./tracking-card") return components("tracking-card", snapshot);
    if (id === "./tracking-state") return trackingState;
    if (id === "./format") return { formatDateTime: (value) => value };
    if (id === "sonner") return { toast: {} };
    if (id === "./common" || id === "lucide-react" || id.startsWith("@/components/staff/ui/")) return new Proxy({}, { get: (_target, key) => key });
    throw new Error(`Unexpected dependency: ${id}`);
  }, loaded, loaded.exports);
  return loaded.exports;
}

function panel(snapshot) {
  return components("tracking-card", snapshot).TrackingCardPanel({ kind: "mentee", subjectId: "mentee", subjectName: "חניכה" });
}

function elements(tree) {
  if (!tree || typeof tree !== "object") return [];
  if (typeof tree.type === "function" && tree.type.name === "TrackingUnavailable") return elements(tree.type(tree.props));
  return [tree, ...[tree.props?.children].flat(Infinity).flatMap(elements)];
}

const actor = { role: "coordinator", active: true };

test("unavailable tracking does not offer edit or report controls", () => {
  const tree = panel({ actor });
  const nodes = elements(tree);
  assert.equal(nodes.some((node) => node.type === "Alert"), true);
  assert.equal(nodes.some((node) => node.type === "DialogTrigger"), false);
});

test("an available empty tracking collection permits a first card and report", () => {
  const nodes = elements(panel({ actor, trackingCards: [] }));
  assert.equal(nodes.filter((node) => node.type === "DialogTrigger").length, 2);
});

test("mentors receive no tracking panel even when tracking is unavailable", () => {
  assert.equal(panel({ actor: { role: "mentor", active: true } }), null);
});

test("the mentor list does not turn unavailable tracking into empty status values", () => {
  const snapshot = { actor: { ...actor, id: "coordinator" }, staff: [{ id: "mentor", role: "mentor", active: true, coordinatorId: "coordinator", displayName: "חונכת" }], participants: [] };
  const nodes = elements(components("mentor-cards", snapshot).MentorsView());
  assert.equal(nodes.some((node) => node.type === "Alert"), true);
  assert.equal(nodes.some((node) => node.type === "Table"), false);
});

test("the mentor list remains available when tracking is ready but no cards exist", () => {
  const snapshot = { actor: { ...actor, id: "coordinator" }, staff: [{ id: "mentor", role: "mentor", active: true, coordinatorId: "coordinator", displayName: "חונכת" }], participants: [], trackingCards: [] };
  const nodes = elements(components("mentor-cards", snapshot).MentorsView());
  assert.equal(nodes.some((node) => node.type === "Table"), true);
});
