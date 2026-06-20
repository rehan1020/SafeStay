(() => {
  // js/agents/stressCalibrator.js
  function calibrateStress(text) {
    if (!text || typeof text !== "string") return "NORMAL";
    const textLower = text.toLowerCase();
    const tier1Crisis = ["suicide", "kill myself", "kill me", "end my life", "trafficking"];
    const isTier1 = tier1Crisis.some((kw) => textLower.includes(kw));
    if (isTier1) return "CRISIS";
    const tier2Crisis = ["abuse", "abused", "hit me", "hits me", "beats me", "beaten", "violent", "violence", "weapon", "gun", "knife", "police", "emergency", "blood", "bleeding", "danger", "dangerous", "threatening", "threatened", "restraining order", "protective order", "stalking", "stalker"];
    const tier2Count = tier2Crisis.filter((kw) => textLower.includes(kw)).length;
    if (tier2Count >= 2) return "CRISIS";
    const fragmentation = (text.match(/!|\?|\.\.\./g) || []).length;
    const uppercaseRatio = text.length > 0 ? text.replace(/[^A-Z]/g, "").length / text.length : 0;
    const urgentKeywords = ["now", "today", "urgent", "homeless", "evicted", "kicked out", "desperate", "scared", "terrified", "help", "please help", "nowhere to go", "sleeping in car"];
    const urgentCount = urgentKeywords.filter((keyword) => textLower.includes(keyword)).length;
    if (fragmentation > 5 || uppercaseRatio > 0.3 || urgentCount >= 2) {
      return "CASEWORKER";
    }
    return "NORMAL";
  }

  // js/agents/llmClient.js
  var _config = {
    provider: "openrouter",
    // "anthropic" | "openrouter"
    apiKey: "",
    // user-supplied, session-only
    model: "anthropic/claude-sonnet-4-20250514"
    // default for openrouter
  };
  var PROVIDER_DEFAULTS = {
    anthropic: { model: "claude-sonnet-4-20250514" },
    openrouter: { model: "anthropic/claude-sonnet-4-20250514" }
  };
  try {
    const savedProvider = localStorage.getItem("safestay_provider");
    const savedModel = localStorage.getItem("safestay_model");
    if (savedProvider && (savedProvider === "anthropic" || savedProvider === "openrouter")) {
      _config.provider = savedProvider;
    }
    if (savedModel) {
      _config.model = savedModel;
    }
  } catch (e) {
  }
  function getConfig() {
    return {
      provider: _config.provider,
      model: _config.model,
      hasKey: !!_config.apiKey
    };
  }
  function setConfig({ provider, apiKey, model }) {
    if (provider && (provider === "anthropic" || provider === "openrouter")) {
      _config.provider = provider;
      if (!model) {
        _config.model = PROVIDER_DEFAULTS[provider].model;
      }
    }
    if (apiKey !== void 0) {
      _config.apiKey = apiKey;
    }
    if (model) {
      _config.model = model;
    }
    try {
      localStorage.setItem("safestay_provider", _config.provider);
      localStorage.setItem("safestay_model", _config.model);
    } catch (e) {
    }
  }
  function getDefaultModel(provider) {
    return PROVIDER_DEFAULTS[provider]?.model || "";
  }
  var LLMError = class extends Error {
    constructor(message, code) {
      super(message);
      this.name = "LLMError";
      this.code = code;
    }
  };
  function normalizeHttpError(status, responseBody) {
    let snippet = "";
    if (responseBody) {
      snippet = " - " + responseBody.substring(0, 200).replace(/["'\n\r]/g, " ");
    }
    if (status === 401 || status === 403) {
      return new LLMError("Authentication failed. Check your API key." + snippet, "AUTH_ERROR");
    }
    if (status === 429) {
      return new LLMError("Rate limit exceeded. Please wait and retry." + snippet, "RATE_LIMIT");
    }
    if (status >= 500) {
      return new LLMError("Provider server error. Please try again." + snippet, "NETWORK_ERROR");
    }
    return new LLMError(`Request failed with status ${status}.` + snippet, "UNKNOWN");
  }
  function stripCodeFences(text) {
    if (!text || typeof text !== "string") return text;
    const fenceRegex = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/;
    const match = text.trim().match(fenceRegex);
    if (match) {
      return match[1].trim();
    }
    return text.trim();
  }
  async function callLLM(systemPrompt, userPrompt, signal = null) {
    if (!_config.apiKey) {
      throw new LLMError("No API key configured. Please set your API key in settings.", "AUTH_ERROR");
    }
    if (_config.provider === "anthropic") {
      return callAnthropic(systemPrompt, userPrompt, signal);
    } else if (_config.provider === "openrouter") {
      return callOpenRouter(systemPrompt, userPrompt, signal);
    } else {
      throw new LLMError(`Unknown provider: ${_config.provider}`, "UNKNOWN");
    }
  }
  async function callAnthropic(systemPrompt, userPrompt, signal = null) {
    const url = "https://api.anthropic.com/v1/messages";
    const headers = {
      "x-api-key": _config.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    };
    const body = {
      model: _config.model,
      max_tokens: 4096,
      temperature: 0.3,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }]
    };
    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal
      });
    } catch (err) {
      if (err.name === "AbortError") {
        throw new LLMError("Request was cancelled.", "ABORT");
      }
      throw new LLMError(`Network error: ${err.message}`, "NETWORK_ERROR");
    }
    if (!response.ok) {
      let errorBody = "";
      try {
        errorBody = await response.text();
      } catch (e) {
      }
      throw normalizeHttpError(response.status, errorBody);
    }
    let data;
    try {
      data = await response.json();
    } catch (err) {
      throw new LLMError("Failed to parse provider response.", "PARSE_ERROR");
    }
    const text = data?.content?.[0]?.text;
    if (!text) {
      throw new LLMError("Empty response from provider.", "PARSE_ERROR");
    }
    return stripCodeFences(text);
  }
  async function callOpenRouter(systemPrompt, userPrompt, signal = null) {
    const url = "https://openrouter.ai/api/v1/chat/completions";
    const headers = {
      "Authorization": `Bearer ${_config.apiKey}`,
      "content-type": "application/json"
    };
    const body = {
      model: _config.model,
      max_tokens: 4096,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    };
    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal
      });
    } catch (err) {
      if (err.name === "AbortError") {
        throw new LLMError("Request was cancelled.", "ABORT");
      }
      throw new LLMError(`Network error: ${err.message}`, "NETWORK_ERROR");
    }
    if (!response.ok) {
      let errorBody = "";
      try {
        errorBody = await response.text();
      } catch (e) {
      }
      throw normalizeHttpError(response.status, errorBody);
    }
    let data;
    try {
      data = await response.json();
    } catch (err) {
      throw new LLMError("Failed to parse provider response.", "PARSE_ERROR");
    }
    const text = data?.choices?.[0]?.message?.content;
    if (!text) {
      throw new LLMError("Empty response from provider.", "PARSE_ERROR");
    }
    return stripCodeFences(text);
  }

  // js/knowledgeBase.js
  var rules = [
    {
      id: "era_1",
      category: "Emergency Rental Assistance",
      description: "Financial assistance for rent and utilities to prevent eviction.",
      blockers: ["Income exceeds 80% AMI", "No proof of COVID-19/financial hardship impact", "Lease not in applicant's name"],
      bypass_strategies: ["Use self-attestation forms if documented proof is missing", "Check local community action agencies for non-federal funds with looser restrictions"]
    },
    {
      id: "sec8_1",
      category: "Section 8 Rights",
      description: "Protections for tenants with Housing Choice Vouchers against discrimination and unjust eviction.",
      blockers: ["Landlord refuses to accept voucher (source of income discrimination)", "Unit fails Housing Quality Standards (HQS) inspection"],
      bypass_strategies: ["Report landlord to local Fair Housing office if source of income discrimination is illegal in state/city", "Request extension for landlord to make repairs before voucher expires"]
    },
    {
      id: "evic_1",
      category: "Eviction Processes",
      description: "Legal proceedings required to remove a tenant from a rental property.",
      blockers: ["Self-help eviction (lockout, utility shutoff)", "Improper notice period given"],
      bypass_strategies: ["Call police to regain entry if illegally locked out", "File emergency injunction in housing court to restore utilities", "Use improper notice as defense to get case dismissed"]
    },
    {
      id: "dv_1",
      category: "Domestic Violence Protections",
      description: "Violence Against Women Act (VAWA) and local laws protecting survivors' housing rights.",
      blockers: ["Landlord attempts to evict due to noise/police calls related to abuse", "Victim cannot afford rent without abuser's income"],
      bypass_strategies: ["Invoke VAWA protections to prevent eviction based on criminal activity of abuser", "Request emergency transfer to new unit", "Break lease without penalty (depending on state law) with police report or protective order"]
    },
    {
      id: "lease_1",
      category: "Lease Violation & Non-Renewal Disputes",
      description: "Tenant rights when facing cure-or-quit notices, alleged lease violations, or non-renewal at lease end.",
      blockers: ["Landlord claims lease violation without proper documentation", "Non-renewal used as pretext for retaliation or discrimination", "Tenant unaware of cure period rights"],
      bypass_strategies: ["Demand written specification of alleged violation with evidence", "Invoke anti-retaliation statutes if non-renewal follows complaint or repair request", "Cure the violation within statutory period and document compliance in writing", "Check if local law requires 'just cause' for non-renewal"]
    },
    {
      id: "habit_1",
      category: "Habitability & Repair Withholding",
      description: "Tenant protections when landlord fails to maintain habitable conditions (heat, plumbing, mold, pests, structural safety).",
      blockers: ["Landlord ignores repair requests", "Tenant fears retaliation for complaining", "Tenant withholds rent without following legal procedure"],
      bypass_strategies: ["Send repair request in writing (email/letter) to create a paper trail", "File complaint with local housing/building code enforcement", "Use rent escrow or repair-and-deduct where state law permits \u2014 requires proper notice first", "Document conditions with dated photos/videos before and after reporting"]
    },
    {
      id: "cotenant_1",
      category: "Co-Tenant & Roommate Situations",
      description: "Issues where a co-tenant or unauthorized occupant creates lease liability, including roommate disputes, subletting, and unauthorized guests.",
      blockers: ["Co-tenant listed on lease moves out leaving remaining tenant liable for full rent", "Unauthorized occupant triggers lease violation", "Roommate's behavior (noise, damage) leads to eviction proceedings against all tenants"],
      bypass_strategies: ["Request lease amendment removing departed co-tenant's name", "Negotiate directly with landlord to add or remove occupants formally", "If co-tenant abandoned, document the departure and request sole-tenant status", "Consult legal aid about joint-and-several liability protections in your jurisdiction"]
    },
    {
      id: "immig_1",
      category: "Immigrant & Non-Citizen Housing Protections",
      description: "Housing rights for undocumented and non-citizen tenants, including protections against immigration-status-based discrimination and threats.",
      blockers: ["Landlord threatens to report immigration status to ICE", "Tenant fears interacting with government agencies or courts", "Tenant lacks SSN or government ID required by some assistance programs"],
      bypass_strategies: ["Fair Housing Act protects tenants regardless of immigration status \u2014 discrimination based on national origin is illegal", "ITIN (Individual Taxpayer Identification Number) may substitute for SSN in many assistance applications", "Many legal aid organizations serve clients regardless of immigration status \u2014 seek these out", "Landlord retaliation involving immigration threats may itself be a crime in some jurisdictions \u2014 document all threats"]
    }
  ];

  // js/agents/caseworkerReasoner.js
  function buildSystemPrompt() {
    const rulesText = rules.map(
      (r) => `### ${r.id}: ${r.category}
${r.description}
Blockers: ${r.blockers.join("; ")}
Bypasses: ${r.bypass_strategies.join("; ")}`
    ).join("\n\n");
    return `You are SafeStay Caseworker AI \u2014 an expert housing crisis analyst that reasons like a seasoned social services caseworker. You analyze tenant/housing situations and produce structured, actionable guidance.

GROUNDING KNOWLEDGE BASE (you MUST use these rules as your primary reference):
${rulesText}

CRITICAL RULES FOR YOUR OUTPUT:
1. You must NEVER say "you qualify" \u2014 only "you may qualify" or "this may apply to you"
2. Every actionPlan item's source_rule MUST trace to a real rule ID from the knowledge base above (e.g., "era_1", "evic_1") or "general_guidance" if no rule fits. Do NOT fabricate rule IDs.
3. Reason adversarially \u2014 consider what could go wrong, what the user might miss, what a landlord or system might exploit. Two different situations must NEVER produce identical analysis.
4. The faultMap must be a text-graph showing: YOUR SITUATION \u2192 BLOCKER \u2192 BYPASS \u2192 PROGRAM \u2192 EXIT using indented arrows and text formatting.
   Example faultMap format:
   [YOUR SITUATION: Behind on rent, eviction notice served]
     \u2192 [BLOCKER: 3-day notice period expired] \u2014 impact: HARD
         \u21B3 BYPASS: File emergency motion to stay eviction
     \u2192 [PROGRAM: Emergency Rental Assistance (ERA)]
         \u21B3 May cover back rent if income-eligible
     \u2192 [EXIT: Attend court hearing with documentation + ERA application proof]
5. Cap actionPlan at 7 items maximum. Cap missed and disqualifiers at 3 items each.
6. Output STRICTLY as JSON \u2014 no prose before or after, no markdown code fences.
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
  "faultMap": "text-graph string with indentation showing YOUR SITUATION \u2192 BLOCKER \u2192 BYPASS \u2192 PROGRAM \u2192 EXIT pathways",
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
  function getSafeStateFallback(userText) {
    return {
      profile: {
        urgency: "unknown",
        trigger: "other",
        housing_type: "renter",
        income_status: "unknown",
        dependents: false,
        missing_fields: []
      },
      summary: "We were unable to fully analyze your situation with AI at this time. The guidance below covers general first steps that apply to most housing crises.",
      isDomesticViolence: false,
      faultMap: `[YOUR SITUATION]
  \u2192 [BLOCKER: Analysis unavailable] \u2014 impact: TEMPORARY
      \u21B3 BYPASS: Proceed with general guidance below
  \u2192 [PROGRAM: Local housing legal aid]
      \u21B3 They can assess your specific rights and options
  \u2192 [EXIT: Contact a legal aid organization for personalized help]`,
      missed: [
        "Many tenants have legal protections they are unaware of \u2014 a legal aid attorney can identify these",
        "Documentation of all communications with your landlord is critical \u2014 start now",
        "Time limits on legal actions are strict \u2014 do not delay seeking help"
      ],
      disqualifiers: [
        "Missing court deadlines can result in default judgments against you",
        "Verbal agreements without documentation may be difficult to enforce",
        "Some assistance programs have strict eligibility windows \u2014 apply early"
      ],
      actionPlan: [
        {
          rank: 1,
          action: "Contact your local housing legal aid organization for a free consultation",
          urgency: "THIS WEEK",
          effort: "LOW",
          unlocks: "Expert assessment of your specific legal rights and available programs",
          source_rule: "general_guidance"
        },
        {
          rank: 2,
          action: "Gather and organize all housing-related documents (lease, notices, correspondence)",
          urgency: "THIS WEEK",
          effort: "MEDIUM",
          unlocks: "Enables legal aid to assess your case quickly and accurately",
          source_rule: "general_guidance"
        },
        {
          rank: 3,
          action: "Call 211 (United Way) to identify local emergency housing assistance programs",
          urgency: "THIS WEEK",
          effort: "LOW",
          unlocks: "Connects you with emergency rental assistance, shelter, and support services",
          source_rule: "era_1"
        }
      ]
    };
  }
  function validateLLMOutput(parsed) {
    if (parsed.profile && parsed.profile.missing_fields && parsed.profile.missing_fields.length > 0) {
      if (!parsed.summary && !parsed.faultMap) {
        return { valid: true, needsFollowUp: true };
      }
    }
    const requiredKeys = ["profile", "summary", "faultMap", "missed", "disqualifiers", "actionPlan"];
    for (const key of requiredKeys) {
      if (!(key in parsed)) {
        return { valid: false, reason: `Missing required key: ${key}` };
      }
    }
    if (!Array.isArray(parsed.actionPlan)) {
      return { valid: false, reason: "actionPlan must be an array" };
    }
    if (!Array.isArray(parsed.missed)) {
      return { valid: false, reason: "missed must be an array" };
    }
    if (!Array.isArray(parsed.disqualifiers)) {
      return { valid: false, reason: "disqualifiers must be an array" };
    }
    if (typeof parsed.summary !== "string") {
      return { valid: false, reason: "summary must be a string" };
    }
    if (typeof parsed.faultMap !== "string") {
      return { valid: false, reason: "faultMap must be a string" };
    }
    return { valid: true, needsFollowUp: false };
  }
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
    if (output.actionPlan) {
      output.actionPlan = output.actionPlan.map((item, i) => ({
        ...item,
        rank: i + 1
      }));
    }
    return output;
  }
  async function analyzeWithLLM(userText, signal = null) {
    const systemPrompt = buildSystemPrompt();
    const rawResponse = await callLLM(systemPrompt, userText, signal);
    let parsed;
    try {
      parsed = JSON.parse(rawResponse);
    } catch (e1) {
      let jsonMatch = rawResponse.match(/\{\s*"profile"[\s\S]*\}/);
      if (!jsonMatch) {
        jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      }
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch (e2) {
          console.warn("LLM output could not be parsed as JSON after retry.");
          return getSafeStateFallback(userText);
        }
      } else {
        console.warn("No JSON found in LLM response.");
        return getSafeStateFallback(userText);
      }
    }
    const validation = validateLLMOutput(parsed);
    if (!validation.valid) {
      console.warn(`LLM output failed validation: ${validation.reason}`);
      return getSafeStateFallback(userText);
    }
    if (validation.needsFollowUp) {
      return { needsFollowUp: true, profile: parsed.profile };
    }
    parsed.isDomesticViolence = !!parsed.isDomesticViolence;
    return enforceOutputLimits(parsed);
  }

  // js/agents/index.js
  async function runPipeline(userText, signal = null) {
    const stressMode = calibrateStress(userText);
    const llmResult = await analyzeWithLLM(userText, signal);
    return {
      stressMode,
      ...llmResult
    };
  }
  function checkCrisisKeywords(text) {
    return calibrateStress(text) === "CRISIS";
  }

  // js/renderer.js
  function renderInstantSafetyDisclaimer(container) {
    if (container.querySelector(".instant-safety-disclaimer")) return;
    const safetyBlock = document.createElement("div");
    safetyBlock.className = "result-section instant-safety-disclaimer danger-alert glass-panel";
    safetyBlock.innerHTML = `
    <div class="safety-header">
      <span class="safety-icon">\u{1F6E1}\uFE0F</span>
      <h2>IMMEDIATE SAFETY RESOURCES</h2>
    </div>
    <div class="safety-content">
      <p class="safety-primary"><strong>If you are in immediate danger, call 911 now.</strong></p>
      <div class="safety-hotlines">
        <div class="hotline-item">
          <span class="hotline-label">National DV Hotline:</span>
          <a href="tel:18007997233" class="hotline-number">1-800-799-7233</a>
        </div>
        <div class="hotline-item">
          <span class="hotline-label">Crisis Text Line:</span>
          <span class="hotline-number">Text HOME to <a href="sms:741741" class="hotline-number">741741</a></span>
        </div>
        <div class="hotline-item">
          <span class="hotline-label">National Suicide Prevention:</span>
          <a href="tel:988" class="hotline-number">988</a>
        </div>
      </div>
      <p class="safety-note">Your safety comes first. The analysis below addresses housing options \u2014 but please reach out to trained crisis counselors using the numbers above.</p>
    </div>
  `;
    container.prepend(safetyBlock);
  }
  function renderToolbar() {
    const toolbar = document.createElement("div");
    toolbar.className = "results-toolbar";
    toolbar.innerHTML = `
    <button class="toolbar-btn" id="copy-results-btn" type="button">\u{1F4CB} Copy Results</button>
    <button class="toolbar-btn" id="print-results-btn" type="button">\u{1F5A8}\uFE0F Print</button>
  `;
    toolbar.querySelector("#copy-results-btn").addEventListener("click", (e) => {
      const btn = e.currentTarget;
      let textToCopy = "";
      const container = btn.closest(".output-container");
      const sections = container.querySelectorAll(".result-section");
      sections.forEach((sec) => {
        textToCopy += sec.innerText + "\n\n";
      });
      navigator.clipboard.writeText(textToCopy.trim()).then(() => {
        const origText = btn.innerHTML;
        btn.innerHTML = "\u2713 Copied";
        btn.classList.add("copied");
        setTimeout(() => {
          btn.innerHTML = origText;
          btn.classList.remove("copied");
        }, 2e3);
      });
    });
    toolbar.querySelector("#print-results-btn").addEventListener("click", () => {
      window.print();
    });
    return toolbar;
  }
  function renderResults(outputContainer, pipelineOutput) {
    pipelineOutput.isDomesticViolence = !!pipelineOutput.isDomesticViolence;
    const existingSafety = outputContainer.querySelector(".instant-safety-disclaimer");
    outputContainer.innerHTML = "";
    const fragment = document.createDocumentFragment();
    if (existingSafety) {
      fragment.appendChild(existingSafety);
    }
    const toolbar = renderToolbar();
    fragment.appendChild(toolbar);
    const summarySection = document.createElement("div");
    summarySection.className = "result-section summary-section glass-panel";
    summarySection.id = "section-summary";
    summarySection.innerHTML = `
    <div class="section-header">
      <span class="section-number">01</span>
      <h2>Situation Summary</h2>
    </div>
    <p class="summary-text">${escapeHtml(pipelineOutput.summary || "Summary unavailable.")}</p>
  `;
    fragment.appendChild(summarySection);
    const faultMapSection = document.createElement("div");
    faultMapSection.className = "result-section fault-map-section";
    faultMapSection.id = "section-faultmap";
    let faultMapHTML = escapeHtml(pipelineOutput.faultMap || "Fault map unavailable.");
    faultMapHTML = faultMapHTML.replace(/(→|↳)/g, '<span class="fm-arrow">$1</span>').replace(/BLOCKER/g, '<span class="fm-blocker">BLOCKER</span>').replace(/BYPASS/g, '<span class="fm-bypass">BYPASS</span>').replace(/PROGRAM/g, '<span class="fm-program">PROGRAM</span>').replace(/EXIT/g, '<span class="fm-exit">EXIT</span>').replace(/YOUR SITUATION|\[YOUR SITUATION\]/g, '<span class="fm-situation">$&</span>');
    faultMapSection.innerHTML = `
    <div class="section-header">
      <span class="section-number">02</span>
      <h2>Fault Map</h2>
    </div>
    <pre class="fault-map"><code>${faultMapHTML}</code></pre>
  `;
    fragment.appendChild(faultMapSection);
    const missedSection = document.createElement("div");
    missedSection.className = "result-section missed-section glass-panel";
    missedSection.id = "section-missed";
    const missedItems = (pipelineOutput.missed || []).slice(0, 3);
    const missedHTML = missedItems.length > 0 ? missedItems.map((item) => `<li><span class="list-icon warning-icon">\u26A0\uFE0F</span> ${escapeHtml(item)}</li>`).join("") : '<li><span class="list-icon warning-icon">\u26A0\uFE0F</span> No hidden flags detected in standard analysis.</li>';
    missedSection.innerHTML = `
    <div class="section-header">
      <span class="section-number">03</span>
      <h2>What Most People Miss</h2>
    </div>
    <ul class="insight-list warning-list">${missedHTML}</ul>
  `;
    fragment.appendChild(missedSection);
    const disqualifierSection = document.createElement("div");
    disqualifierSection.className = "result-section disqualifier-section glass-panel";
    disqualifierSection.id = "section-disqualifiers";
    const disqualifierItems = (pipelineOutput.disqualifiers || []).slice(0, 3);
    const disqualifierHTML = disqualifierItems.length > 0 ? disqualifierItems.map((item) => `<li><span class="list-icon danger-icon">\u{1F6AB}</span> ${escapeHtml(item)}</li>`).join("") : '<li><span class="list-icon danger-icon">\u{1F6AB}</span> No immediate disqualifier risks detected.</li>';
    disqualifierSection.innerHTML = `
    <div class="section-header">
      <span class="section-number">04</span>
      <h2>Disqualifier Warnings</h2>
    </div>
    <ul class="insight-list error-list">${disqualifierHTML}</ul>
  `;
    fragment.appendChild(disqualifierSection);
    const actionPlanSection = document.createElement("div");
    actionPlanSection.className = "result-section action-plan-section glass-panel";
    actionPlanSection.id = "section-actionplan";
    const actionItems = (pipelineOutput.actionPlan || []).slice(0, 7);
    let actionRowsHTML = "";
    const sources = /* @__PURE__ */ new Set();
    actionItems.forEach((step) => {
      let urgencyClass = (step.urgency || "").toLowerCase();
      urgencyClass = urgencyClass.replace(/[^a-z0-9\-]/g, "");
      let effortClass = (step.effort || "").toLowerCase();
      effortClass = effortClass.replace(/[^a-z0-9\-]/g, "");
      actionRowsHTML += `
      <tr>
        <td class="rank-cell">${escapeHtml(step.rank ? String(step.rank) : "")}</td>
        <td class="action-cell">${escapeHtml(step.action || "")}</td>
        <td><span class="badge urgency-${urgencyClass}">${escapeHtml(step.urgency || "")}</span></td>
        <td><span class="badge effort-${effortClass}">${escapeHtml(step.effort || "")}</span></td>
        <td class="unlocks-cell">${escapeHtml(step.unlocks || "")}</td>
      </tr>
    `;
      if (step.source_rule) {
        sources.add(step.source_rule);
      }
    });
    const sourcesHTML = sources.size > 0 ? `<div class="action-sources">${[...sources].map((s) => `<span class="source-tag">\u{1F4CC} ${escapeHtml(s)}</span>`).join(" ")}</div>` : "";
    actionPlanSection.innerHTML = `
    <div class="section-header">
      <span class="section-number">05</span>
      <h2>Your Action Plan</h2>
    </div>
    <div class="table-wrapper">
      <table class="action-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Action</th>
            <th>When</th>
            <th>Effort</th>
            <th>Unlocks</th>
          </tr>
        </thead>
        <tbody>
          ${actionRowsHTML || '<tr><td colspan="5">No action items generated.</td></tr>'}
        </tbody>
      </table>
    </div>
    ${sourcesHTML}
  `;
    fragment.appendChild(actionPlanSection);
    const disclaimerSection = document.createElement("div");
    disclaimerSection.className = "result-section disclaimer-section glass-panel";
    disclaimerSection.id = "section-referral";
    disclaimerSection.innerHTML = `
    <div class="section-header">
      <span class="section-number">06</span>
      <h2>Mandatory Human Referral</h2>
    </div>
    <div class="legal-disclaimer">
      <div class="disclaimer-divider"></div>
      <p><strong>\u2696\uFE0F SafeStay does not make legal determinations.</strong></p>
      <p>One or more steps above may require legal interpretation specific to your location.</p>
      <p><strong>Next step:</strong> Contact a local housing legal aid organization or tenant rights service before taking any action marked HIGH effort or involving formal notices.</p>
      <p class="disclaimer-emphasis">This is not legal advice.</p>
      <div class="disclaimer-divider"></div>
    </div>
  `;
    fragment.appendChild(disclaimerSection);
    outputContainer.appendChild(fragment);
    if (pipelineOutput.isDomesticViolence && !existingSafety) {
      renderInstantSafetyDisclaimer(outputContainer);
    }
    const sections = outputContainer.querySelectorAll(".result-section");
    sections.forEach((section, index) => {
      section.style.animationDelay = `${index * 0.1}s`;
      section.classList.add("animate-in");
    });
  }
  function renderFallback(outputContainer) {
    renderResults(outputContainer, {
      summary: "We encountered an issue analyzing your situation. Please see the general guidance below.",
      faultMap: "[YOUR SITUATION]\n  \u2192 [STATUS: Analysis temporarily unavailable]\n      \u21B3 NEXT STEP: Contact local housing legal aid directly\n  \u2192 [EXIT: Human referral required]",
      missed: ["Always document all communications with your landlord in writing"],
      disqualifiers: ["Missing court deadlines can result in default judgments"],
      actionPlan: [{
        rank: 1,
        action: "Contact local housing legal aid for a free consultation",
        urgency: "THIS WEEK",
        effort: "LOW",
        unlocks: "Expert assessment of your specific rights",
        source_rule: "general_guidance"
      }],
      isDomesticViolence: false
    });
  }
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // js/app.js
  var PROCESSING_TIMEOUT_MS = 6e4;
  var FOLLOWUP_FIELD_MAP = {
    urgency: {
      label: "How soon do you need to act?",
      chips: ["Today / Immediately", "Within days", "Within weeks", "Within months"]
    },
    trigger: {
      label: "What caused this situation?",
      chips: ["Eviction notice", "Job loss / can't pay rent", "Domestic violence", "Lease ending / not renewed", "Habitability issues", "Other"]
    },
    housing_type: {
      label: "What is your housing situation?",
      chips: ["Renting apartment/house", "Informal arrangement (no lease)", "In shelter / unhoused", "Own my home"]
    }
  };
  var SafeStayApp = class {
    constructor() {
      this.heroSection = document.getElementById("hero-section");
      this.intakeSection = document.getElementById("intake-section");
      this.intakeForm = document.getElementById("intake-form");
      this.situationInput = document.getElementById("situation-input");
      this.charCount = document.getElementById("char-count");
      this.followupSection = document.getElementById("followup-section");
      this.followupPrompt = document.getElementById("followup-prompt");
      this.followupChips = document.getElementById("followup-chips");
      this.intakeError = document.getElementById("intake-error");
      this.submitButton = document.getElementById("submit-button");
      this.processingSection = document.getElementById("processing-section");
      this.outputContainer = document.getElementById("output-container");
      this.restartSection = document.getElementById("restart-section");
      this.restartButton = document.getElementById("restart-button");
      this.settingsToggle = document.getElementById("settings-toggle");
      this.settingsOverlay = document.getElementById("settings-overlay");
      this.settingsPanel = document.getElementById("settings-panel");
      this.settingsClose = document.getElementById("settings-close");
      this.settingsForm = document.getElementById("settings-form");
      this.providerSelect = document.getElementById("provider-select");
      this.apiKeyInput = document.getElementById("api-key-input");
      this.modelInput = document.getElementById("model-input");
      this.modelHint = document.getElementById("model-hint");
      this.settingsError = document.getElementById("settings-error");
      this.isFollowUp = false;
      this.originalInput = "";
      this.followUpSelections = {};
      this.abortController = null;
      this.elapsedInterval = null;
      this.init();
    }
    init() {
      this.intakeForm.addEventListener("submit", (e) => this.handleSubmit(e));
      this.situationInput.addEventListener("input", () => {
        const len = this.situationInput.value.length;
        this.charCount.textContent = `${len} / 5,000`;
      });
      document.querySelectorAll(".example-chip").forEach((chip) => {
        chip.addEventListener("click", () => {
          this.situationInput.value = chip.dataset.scenario;
          const len = chip.dataset.scenario.length;
          this.charCount.textContent = `${len} / 5,000`;
          this.situationInput.focus();
        });
      });
      this.settingsToggle.addEventListener("click", () => {
        console.log("TOGGLE CLICKED");
        this.openSettings();
      });
      this.settingsClose.addEventListener("click", () => this.closeSettings());
      this.settingsOverlay.addEventListener("click", (e) => {
        if (e.target === this.settingsOverlay) this.closeSettings();
      });
      this.settingsForm.addEventListener("submit", (e) => this.saveSettings(e));
      this.providerSelect.addEventListener("change", () => this.onProviderChange());
      this.restartButton.addEventListener("click", () => this.restart());
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !this.settingsOverlay.classList.contains("hidden")) {
          this.closeSettings();
        }
      });
      this.syncSettingsUI();
      const config = getConfig();
      if (config.hasKey) {
        this.settingsToggle.classList.add("key-configured");
      }
    }
    // ─── Settings ────────────────────────────────────────────────────
    syncSettingsUI() {
      const config = getConfig();
      this.providerSelect.value = config.provider;
      this.modelInput.value = config.model;
      this.updateModelHint();
    }
    updateModelHint() {
      const provider = this.providerSelect.value;
      if (provider === "openrouter") {
        this.modelHint.textContent = "OpenRouter supports many models \u2014 edit freely (e.g., anthropic/claude-sonnet-4-20250514, google/gemini-2.5-pro)";
      } else {
        this.modelHint.textContent = "Anthropic direct API \u2014 typically claude-sonnet-4-20250514 or claude-3-5-haiku-20241022";
      }
    }
    onProviderChange() {
      const provider = this.providerSelect.value;
      this.modelInput.value = getDefaultModel(provider);
      this.updateModelHint();
    }
    openSettings() {
      this.settingsOverlay.classList.remove("hidden");
      this.settingsError.classList.add("hidden");
      this.apiKeyInput.focus();
    }
    closeSettings() {
      this.settingsOverlay.classList.add("hidden");
    }
    saveSettings(e) {
      e.preventDefault();
      const provider = this.providerSelect.value;
      const apiKey = this.apiKeyInput.value.trim();
      const model = this.modelInput.value.trim();
      if (!apiKey) {
        this.showSettingsError("Please enter your API key.");
        return;
      }
      if (!model) {
        this.showSettingsError("Please specify a model name.");
        return;
      }
      setConfig({ provider, apiKey, model });
      this.settingsToggle.classList.add("key-configured");
      this.settingsError.classList.add("hidden");
      this.closeSettings();
      this.hideIntakeError();
    }
    showSettingsError(msg) {
      this.settingsError.textContent = msg;
      this.settingsError.classList.remove("hidden");
    }
    // ─── Intake & Submission ─────────────────────────────────────────
    async handleSubmit(e) {
      e.preventDefault();
      this.submitButton.disabled = true;
      this.hideIntakeError();
      const config = getConfig();
      if (!config.hasKey) {
        this.showIntakeError("Please configure your API provider and key first.");
        this.openSettings();
        this.submitButton.disabled = false;
        return;
      }
      const rawText = this.situationInput.value.trim();
      if (!rawText && !this.isFollowUp) {
        this.showIntakeError("Please describe your housing situation.");
        this.submitButton.disabled = false;
        return;
      }
      if (rawText.length > 5e3) {
        this.showIntakeError("Please keep your description under 5,000 characters.");
        this.submitButton.disabled = false;
        return;
      }
      if (this.isFollowUp && Object.keys(this.followUpSelections).length === 0) {
        this.showIntakeError("Please select at least one option above before continuing.");
        this.submitButton.disabled = false;
        return;
      }
      let combinedText;
      if (this.isFollowUp) {
        const followUpParts = Object.entries(this.followUpSelections).map(([field, value]) => `${field}: ${value}`).join(". ");
        combinedText = `${this.originalInput}

Additional details: ${followUpParts}`;
      } else {
        combinedText = rawText;
      }
      this.abortController = new AbortController();
      this.showProcessing();
      const isCrisis = checkCrisisKeywords(combinedText);
      if (isCrisis) {
        this.outputContainer.innerHTML = "";
        this.outputContainer.classList.remove("hidden");
        renderInstantSafetyDisclaimer(this.outputContainer);
      }
      let timeoutId;
      try {
        const result = await Promise.race([
          runPipeline(combinedText, this.abortController.signal),
          new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error("TIMEOUT")), PROCESSING_TIMEOUT_MS);
          })
        ]);
        clearTimeout(timeoutId);
        if (result.needsFollowUp && result.profile?.missing_fields?.length > 0) {
          this.originalInput = combinedText;
          this.showFollowUp(result.profile.missing_fields);
          this.submitButton.disabled = false;
          return;
        }
        this.showResults(result);
      } catch (error) {
        clearTimeout(timeoutId);
        this.handleError(error);
      }
    }
    // ─── Follow-up Logic ─────────────────────────────────────────────
    showFollowUp(missingFields) {
      this.hideProcessing();
      this.heroSection.classList.add("hidden");
      this.intakeSection.classList.remove("hidden");
      this.isFollowUp = true;
      this.followupPrompt.textContent = "We need a bit more detail to give you accurate guidance:";
      this.followupChips.innerHTML = "";
      missingFields.forEach((field) => {
        const fieldConfig = FOLLOWUP_FIELD_MAP[field];
        if (!fieldConfig) return;
        const fieldContainer = document.createElement("div");
        fieldContainer.className = "followup-field-group";
        const label = document.createElement("p");
        label.className = "followup-field-label";
        label.textContent = fieldConfig.label;
        label.style.cssText = "font-size:0.85rem;color:var(--text-muted);margin-bottom:0.4rem;margin-top:0.6rem;";
        fieldContainer.appendChild(label);
        const chipsRow = document.createElement("div");
        chipsRow.style.cssText = "display:flex;flex-wrap:wrap;gap:0.4rem;";
        fieldConfig.chips.forEach((chipText) => {
          const chip = document.createElement("button");
          chip.type = "button";
          chip.className = "followup-chip";
          chip.textContent = chipText;
          chip.setAttribute("aria-pressed", "false");
          chip.addEventListener("click", () => {
            chipsRow.querySelectorAll(".followup-chip").forEach((c) => {
              c.classList.remove("selected");
              c.setAttribute("aria-pressed", "false");
            });
            chip.classList.add("selected");
            chip.setAttribute("aria-pressed", "true");
            this.followUpSelections[field] = chipText;
          });
          chipsRow.appendChild(chip);
        });
        fieldContainer.appendChild(chipsRow);
        this.followupChips.appendChild(fieldContainer);
      });
      this.followupSection.classList.remove("hidden");
      this.submitButton.querySelector(".btn-text").textContent = "Continue Analysis";
      this.followupSection.tabIndex = -1;
      this.followupSection.focus();
    }
    // ─── Error Handling ──────────────────────────────────────────────
    handleError(error) {
      if (error?.code === "ABORT" || error?.name === "AbortError") return;
      this.submitButton.disabled = false;
      console.warn("Pipeline error:", error?.message || error);
      if (error?.message === "TIMEOUT") {
        this.outputContainer.classList.remove("hidden");
        renderFallback(this.outputContainer);
        this.showResultsUI();
        return;
      }
      const code = error?.code;
      switch (code) {
        case "AUTH_ERROR":
          this.hideProcessing();
          this.intakeSection.classList.remove("hidden");
          this.showIntakeError("Your API key appears invalid. Please check your settings.");
          this.openSettings();
          return;
        case "RATE_LIMIT":
        case "NETWORK_ERROR": {
          this.hideProcessing();
          this.intakeSection.classList.remove("hidden");
          const message = code === "RATE_LIMIT" ? "Too many requests right now. Please wait a moment and try again." : "We're having trouble connecting. Please check your connection and try again.";
          this.showIntakeError(message);
          const retryBtn = document.createElement("button");
          retryBtn.className = "retry-btn";
          retryBtn.textContent = "Retry";
          retryBtn.type = "button";
          retryBtn.addEventListener("click", () => {
            this.hideIntakeError();
            this.intakeForm.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
          });
          this.intakeError.appendChild(retryBtn);
          return;
        }
        case "PARSE_ERROR":
        default:
          this.outputContainer.classList.remove("hidden");
          renderFallback(this.outputContainer);
          this.showResultsUI();
          return;
      }
    }
    // ─── View Transitions ────────────────────────────────────────────
    showProcessing() {
      this.heroSection.classList.add("hidden");
      this.intakeSection.classList.add("hidden");
      this.followupSection.classList.add("hidden");
      this.processingSection.classList.remove("hidden");
      this.outputContainer.classList.add("hidden");
      this.restartSection.classList.add("hidden");
      const elapsedEl = document.getElementById("elapsed-timer");
      let seconds = 0;
      if (elapsedEl) {
        elapsedEl.textContent = "";
        this.elapsedInterval = setInterval(() => {
          seconds++;
          elapsedEl.textContent = `${seconds}s elapsed`;
        }, 1e3);
      }
      const procText = this.processingSection.querySelector(".processing-text");
      if (procText) {
        procText.tabIndex = -1;
        procText.focus();
      }
    }
    hideProcessing() {
      this.processingSection.classList.add("hidden");
      clearInterval(this.elapsedInterval);
      this.elapsedInterval = null;
    }
    showResults(pipelineOutput) {
      this.outputContainer.classList.remove("hidden");
      renderResults(this.outputContainer, pipelineOutput);
      this.showResultsUI();
    }
    showResultsUI() {
      this.hideProcessing();
      this.heroSection.classList.add("hidden");
      this.intakeSection.classList.add("hidden");
      this.outputContainer.classList.remove("hidden");
      this.restartSection.classList.remove("hidden");
      this.submitButton.disabled = false;
      this.outputContainer.scrollIntoView({ behavior: "smooth", block: "start" });
      this.outputContainer.tabIndex = -1;
      this.outputContainer.focus();
    }
    restart() {
      this.abortController?.abort();
      this.submitButton.disabled = false;
      this.isFollowUp = false;
      this.originalInput = "";
      this.followUpSelections = {};
      this.situationInput.value = "";
      this.charCount.textContent = "0 / 5,000";
      this.followupSection.classList.add("hidden");
      this.followupChips.innerHTML = "";
      this.hideIntakeError();
      this.submitButton.querySelector(".btn-text").textContent = "Analyze My Situation";
      this.heroSection.classList.remove("hidden");
      this.intakeSection.classList.remove("hidden");
      this.processingSection.classList.add("hidden");
      this.outputContainer.classList.add("hidden");
      this.outputContainer.innerHTML = "";
      this.restartSection.classList.add("hidden");
      window.scrollTo({ top: 0, behavior: "smooth" });
      this.situationInput.focus();
    }
    showIntakeError(msg) {
      this.intakeError.textContent = msg;
      this.intakeError.classList.remove("hidden");
      this.intakeError.tabIndex = -1;
      this.intakeError.focus();
    }
    hideIntakeError() {
      this.intakeError.classList.add("hidden");
    }
  };
  document.addEventListener("DOMContentLoaded", () => {
    try {
      window.safeStayApp = new SafeStayApp();
    } catch (e) {
      const errDiv = document.createElement("div");
      errDiv.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:white; color:red; z-index:99999; padding:20px; font-family:monospace; overflow:auto;";
      errDiv.innerHTML = "<h2>Initialization Error</h2><pre>" + e.stack + "</pre>";
      document.body.appendChild(errDiv);
      console.error(e);
    }
  });
})();
