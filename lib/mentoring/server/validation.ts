import { createHash } from "node:crypto";
import type { MentoringCommand } from "../contracts";
export { commandSchema, parseCommand } from "../validation";

/** Stable hashes make equivalent object-key ordering an identical retry. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
}

export function commandHash(command: MentoringCommand): string {
  return createHash("sha256").update(canonicalJson(command)).digest("hex");
}
