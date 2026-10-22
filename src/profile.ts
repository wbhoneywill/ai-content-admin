/**
 * Site profile — the seam that makes this admin site-agnostic.
 *
 * The engine (operations, validation, git service, LLM adapter) is generic.
 * A profile supplies the site-specific pieces: which content repo it edits,
 * its admin domain, and which operations are exposed. The content model
 * (schemas) currently lives in content-model.ts; as more sites are added it
 * would move behind the profile too. For now WriteNow is the only profile.
 */
import type { Operation } from "./operations/types.js";
import { registry } from "./operations/registry.js";

export interface SiteProfile {
  /** Identifier, e.g. "writenow". */
  id: string;
  /** Human name shown in the UI. */
  name: string;
  /** GitHub repo the admin edits, "owner/name". */
  contentRepo: string;
  /** Public production domain, e.g. "www.writenow.berlin". */
  siteDomain: string;
  /** Admin subdomain, e.g. "admin.writenow.berlin". */
  adminDomain: string;
  /** Operations this profile exposes (subset of the registry). */
  operations: Map<string, Operation<never>>;
}

export const writeNowProfile: SiteProfile = {
  id: "writenow",
  name: "Write Now Berlin",
  contentRepo: "wbhoneywill/writenowberlin",
  siteDomain: "www.writenow.berlin",
  adminDomain: "admin.writenow.berlin",
  // WriteNow exposes the full v1 operation set.
  operations: registry,
};

/** Resolve the active profile (single-profile for now; env-driven later). */
export function activeProfile(): SiteProfile {
  return writeNowProfile;
}
