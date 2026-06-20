/**
 * agents/index.js — Simplified pipeline orchestrator.
 * 
 * Replaces the old multi-step fake pipeline with:
 * 1. Client-side stress calibration (instant, no network)
 * 2. Single LLM call via caseworkerReasoner (real AI analysis)
 * 
 * The old situationParser.js and actionSequencer.js are no longer needed —
 * the LLM handles parsing, reasoning, and action sequencing in one call.
 */

import calibrateStress from './stressCalibrator.js';
import { analyzeWithLLM } from './caseworkerReasoner.js';

/**
 * Run the full analysis pipeline.
 * @param {string} userText - User's freeform situation description
 * @returns {Promise<object>} - { stressMode, ...llmResult }
 */
export async function runPipeline(userText, signal = null) {
  // Step 1: Client-side stress calibration (instant)
  const stressMode = calibrateStress(userText);
  
  // Step 2: Real LLM analysis via caseworkerReasoner
  const llmResult = await analyzeWithLLM(userText, signal);
  
  // Combine stress mode with LLM result
  return {
    stressMode,
    ...llmResult
  };
}

/**
 * Check if text triggers crisis-level keywords client-side.
 * Used for instant safety disclaimer before LLM response arrives.
 */
export function checkCrisisKeywords(text) {
  return calibrateStress(text) === 'CRISIS';
}

export { calibrateStress };
