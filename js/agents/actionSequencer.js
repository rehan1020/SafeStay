/**
 * actionSequencer.js — DEPRECATED
 * 
 * This file is no longer used in the production pipeline.
 * The LLM now generates the action plan directly in caseworkerReasoner.js.
 * 
 * Kept for reference only. The old hardcoded action sequencing has been
 * replaced by genuine AI-powered action planning.
 */

// This module is intentionally empty — action sequencing is now handled by the LLM.
// See caseworkerReasoner.js for the new implementation.
export default function sequenceActions() {
  console.warn('actionSequencer.js is deprecated. Action sequencing is now handled by the LLM.');
  return [];
}
