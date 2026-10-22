/**
 * The operation registry: the complete, fixed set of edits the admin can make.
 * The LLM adapter turns this into its tool schema, so adding an operation here
 * automatically makes it available to the agent (and nowhere else can the repo
 * be modified).
 */
import type { Operation } from "./types.js";
import { hidePerson, unhide } from "./visibility.js";
import {
  addPost,
  editBio,
  editPost,
  hidePost,
  removePerson,
  removePost,
  swapPhoto,
} from "./content-ops.js";

// The complete, fixed set of edits the admin can make.
const ALL: Operation<never>[] = [
  hidePerson as Operation<never>,
  unhide as Operation<never>,
  editBio as Operation<never>,
  addPost as Operation<never>,
  editPost as Operation<never>,
  hidePost as Operation<never>,
  removePost as Operation<never>,
  removePerson as Operation<never>,
  swapPhoto as Operation<never>,
];

export const registry = new Map<string, Operation<never>>(
  ALL.map((op) => [op.name, op]),
);

export function getOperation(name: string): Operation<never> | undefined {
  return registry.get(name);
}

export function operationNames(): string[] {
  return [...registry.keys()];
}
