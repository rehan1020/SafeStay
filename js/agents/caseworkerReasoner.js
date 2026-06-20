/**
 * caseworkerReasoner.js — Real LLM-powered reasoning engine.
 * 
 * Replaces the old static if/else logic with a genuine AI call 
 * via llmClient.js. Uses ONE combined call to minimize latency/cost.
 * 
 * The full knowledgeBase rules are injected into the system prompt 
 * as grounding context. The model MUST cite rule IDs it used.
 */

import { callLLM } from './llmClient.js';
import { rules } from '../knowledgeBase.js';

// ─── System Prompt Construction ──────────────────────────────────────

function buildSystemPrompt() {
  const rulesText = rules.map(r => 
    `### ${r.id}: ${r.category}\n${r.description}\nBlockers: ${r.blockers.join('; ')}\nBypasses: ${r.bypass_strategies.join('; ')}`
  ).join('\n\n');
  
  return `You are SafeStay Caseworker AI — an expert housing crisis analyst that reasons like a seasoned social services caseworker. You analyze tenant/housing situations and produce structured, actionable guidance.

GROUNDING KNOWLEDGE BASE (you MUST use these rules as your primary reference):
${rulesText}

CRITICAL RULES FOR YOUR OUTPUT:
1. You must NEVER say "you qualify" — only "you may qualify" or "this may apply to you"
2. Every actionPlan item's source_rule MUST trace to a real rule ID from the knowledge base above (e.g., "era_1", "evic_1") or "general_guidance" if no rule fits. Do NOT fabricate rule IDs.
3. Reason adversarially — consider what could go wrong, what the user might miss, what a landlord or system might exploit. Two different situations must NEVER produce identical analysis.
4. The faultMap must be a text-graph showing: YOUR SITUATION → BLOCKER → BYPASS → PROGRAM → EXIT using indented arrows and text formatting.
   Example faultMap format:
   [YOUR SITUATION: Behind on rent, eviction notice served]
     → [BLOCKER: 3-day notice period expired] — impact: HARD
         ↳ BYPASS: File emergency motion to stay eviction
     → [PROGRAM: Emergency Rental Assistance (ERA)]
         ↳ May cover back rent if income-eligible
     → [EXIT: Attend court hearing with documentation + ERA application proof]
5. Cap actionPlan at 7 items maximum. Cap missed and disqualifiers at 3 items each.
6. Output STRICTLY as JSON — no prose before or after, no markdown code fences.
7. Vary your analysis genuinely based on the actual input. No two different situations should produce identical hidden_flags or disqualifier_risks.
8. Keep each action's text under 20 words. Keep each 'unlocks' description under 15 words. Keep the summary under 50 words.
9. In the faultMap, keep each node description under 15 words.

TASK:
Parse the user's freeform description of their housing situation. Extract a crisis profile and then perform full adversarial reasoning.

If the situation is genuinely ambiguous and you cannot determine urgency, trigger, OR housing_type from the text, return ONLY:
{
  "profile": {
    "urgency": null,
    "trigger": null,
    "housing_type": null,
    "income_status": null,
    "dependents": null,
    "missing_fields": ["list of fields you could not determine"]
  }
}

If you CAN determine the core fields, return the FULL analysis:
{
  "profile": {
    "urgency": "immediate" | "weeks" | "months",
    "trigger": "eviction_notice" | "job_loss" | "domestic" | "lease_end" | "other",
    "housing_type": "renter" | "informal" | "shelter" | "owned",
    "income_status": "employed" | "unemployed" | "benefits" | "unknown",
    "dependents": boolean,
    "missing_fields": []
  },
  "summary": "2-3 sentence caseworker summary of the situation",
  "isDomesticViolence": boolean,
  "faultMap": "text-graph string with indentation showing YOUR SITUATION → BLOCKER → BYPASS → PROGRAM → EXIT pathways",
  "missed": ["up to 3 things most people miss in this situation"],
  "disqualifiers": ["up to 3 risks that could disqualify the person from help"],
  "actionPlan": [
    {
      "rank": 1,
      "action": "specific actionable step",
      "urgency": "TODAY" | "THIS WEEK" | "THIS MONTH",
      "effort": "LOW" | "MEDIUM" | "HIGH",
      "unlocks": "what this step enables",
      "source_rule": "rule_id from knowledge base or general_guidance"
    }
  ]
}`;
}

// ─── Safe-State Fallback ─────────────────────────────────────────────

function getSafeStateFallback(userText) {
  return {
    profile: {
      urgency: 'unknown',
      trigger: 'other',
      housing_type: 'renter',
      income_status: 'unknown',
      dependents: false,
      missing_fields: []
    },
    summary: 'We were unable to fully analyze your situation with AI at this time. The guidance below covers general first steps that apply to most housing crises.',
    isDomesticViolence: false,
    faultMap: `[YOUR SITUATION]
  → [BLOCKER: Analysis unavailable] — impact: TEMPORARY
      ↳ BYPASS: Proceed with general guidance below
  → [PROGRAM: Local housing legal aid]
      ↳ They can assess your specific rights and options
  → [EXIT: Contact a legal aid organization for personalized help]`,
    missed: [
      'Many tenants have legal protections they are unaware of — a legal aid attorney can identify these',
      'Documentation of all communications with your landlord is critical — start now',
      'Time limits on legal actions are strict — do not delay seeking help'
    ],
    disqualifiers: [
      'Missing court deadlines can result in default judgments against you',
      'Verbal agreements without documentation may be difficult to enforce',
      'Some assistance programs have strict eligibility windows — apply early'
    ],
    actionPlan: [
      {
        rank: 1,
        action: 'Contact your local housing legal aid organization for a free consultation',
        urgency: 'THIS WEEK',
        effort: 'LOW',
        unlocks: 'Expert assessment of your specific legal rights and available programs',
        source_rule: 'general_guidance'
      },
      {
        rank: 2,
        action: 'Gather and organize all housing-related documents (lease, notices, correspondence)',
        urgency: 'THIS WEEK',
        effort: 'MEDIUM',
        unlocks: 'Enables legal aid to assess your case quickly and accurately',
        source_rule: 'general_guidance'
      },
      {
        rank: 3,
        action: 'Call 211 (United Way) to identify local emergency housing assistance programs',
        urgency: 'THIS WEEK',
        effort: 'LOW',
        unlocks: 'Connects you with emergency rental assistance, shelter, and support services',
        source_rule: 'era_1'
      }
    ]
  };
}

// ─── Schema Validation ───────────────────────────────────────────────

function validateLLMOutput(parsed) {
  // Check for missing_fields-only response (follow-up needed)
  if (parsed.profile && parsed.profile.missing_fields && parsed.profile.missing_fields.length > 0) {
    if (!parsed.summary && !parsed.faultMap) {
      // This is a "need more info" response — valid
      return { valid: true, needsFollowUp: true };
    }
  }

  // Full response validation
  const requiredKeys = ['profile', 'summary', 'faultMap', 'missed', 'disqualifiers', 'actionPlan'];
  for (const key of requiredKeys) {
    if (!(key in parsed)) {
      return { valid: false, reason: `Missing required key: ${key}` };
    }
  }

  if (!Array.isArray(parsed.actionPlan)) {
    return { valid: false, reason: 'actionPlan must be an array' };
  }

  if (!Array.isArray(parsed.missed)) {
    return { valid: false, reason: 'missed must be an array' };
  }

  if (!Array.isArray(parsed.disqualifiers)) {
    return { valid: false, reason: 'disqualifiers must be an array' };
  }

  if (typeof parsed.summary !== 'string') {
    return { valid: false, reason: 'summary must be a string' };
  }

  if (typeof parsed.faultMap !== 'string') {
    return { valid: false, reason: 'faultMap must be a string' };
  }

  return { valid: true, needsFollowUp: false };
}

// ─── Defensive Truncation ────────────────────────────────────────────

function enforceOutputLimits(output) {
  if (output.actionPlan && output.actionPlan.length > 7) {
    output.actionPlan = output.actionPlan.slice(0, 7);
  }
  if (output.missed && output.missed.length > 3) {
    output.missed = output.missed.slice(0, 3);
  }
  if (output.disqualifiers && output.disqualifiers.length > 3) {
    output.disqualifiers = output.disqualifiers.slice(0, 3);
  }
  // Ensure ranks are sequential
  if (output.actionPlan) {
    output.actionPlan = output.actionPlan.map((item, i) => ({
      ...item,
      rank: i + 1
    }));
  }
  return output;
}

// ─── Main Export ─────────────────────────────────────────────────────

/**
 * Analyze a user's housing situation using real LLM reasoning.
 * @param {string} userText - The user's freeform description
 * @returns {Promise<object>} - Structured analysis result
 * @throws {Error} - Propagates LLMError from llmClient.js with .code field
 */
export async function analyzeWithLLM(userText, signal = null) {
  const systemPrompt = buildSystemPrompt();
  const rawResponse = await callLLM(systemPrompt, userText, signal);
  
  // Attempt JSON parse
  let parsed;
  try {
    parsed = JSON.parse(rawResponse);
  } catch (e1) {
    // Retry: try to extract JSON from response
    let jsonMatch = rawResponse.match(/\{\s*"profile"[\s\S]*\}/);
    if (!jsonMatch) {
      jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    }
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch (e2) {
        // Fall through to safe state
        console.warn('LLM output could not be parsed as JSON after retry.');
        return getSafeStateFallback(userText);
      }
    } else {
      console.warn('No JSON found in LLM response.');
      return getSafeStateFallback(userText);
    }
  }

  // Validate schema
  const validation = validateLLMOutput(parsed);
  if (!validation.valid) {
    console.warn(`LLM output failed validation: ${validation.reason}`);
    return getSafeStateFallback(userText);
  }

  // If follow-up needed, return just the profile
  if (validation.needsFollowUp) {
    return { needsFollowUp: true, profile: parsed.profile };
  }

  // Enforce output limits
  parsed.isDomesticViolence = !!parsed.isDomesticViolence;
  return enforceOutputLimits(parsed);
}

export default analyzeWithLLM;
