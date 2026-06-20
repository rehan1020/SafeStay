/**
 * llmClient.js — Multi-provider LLM abstraction layer.
 * 
 * Supports: Anthropic API and OpenRouter.
 * Both providers produce the same normalized string output.
 * caseworkerReasoner.js and app.js must never know which provider is active.
 * 
 * KNOWN LIMITATION: Direct browser→Anthropic calls will fail with CORS in 
 * standard web deployment outside sandboxed environments. OpenRouter generally 
 * allows browser calls. For a true production deploy, route Anthropic calls 
 * through a minimal serverless proxy (out of scope for 24hr MVP — documented 
 * limitation, not a blocker for demo).
 */

// ─── In-Memory Session Config ────────────────────────────────────────
// API key stored in-memory only — NEVER persisted to localStorage or disk.
// NEVER logged to console or sent anywhere except the chosen provider's endpoint.
let _config = {
  provider: 'openrouter',          // "anthropic" | "openrouter"
  apiKey: '',                       // user-supplied, session-only
  model: 'anthropic/claude-sonnet-4-20250514'  // default for openrouter
};

const PROVIDER_DEFAULTS = {
  anthropic: { model: 'claude-sonnet-4-20250514' },
  openrouter: { model: 'anthropic/claude-sonnet-4-20250514' }
};

try {
  const savedProvider = localStorage.getItem('safestay_provider');
  const savedModel = localStorage.getItem('safestay_model');
  if (savedProvider && (savedProvider === 'anthropic' || savedProvider === 'openrouter')) { _config.provider = savedProvider; }
  if (savedModel) { _config.model = savedModel; }
} catch(e) {}

/**
 * Get current provider config (read-only copy, key redacted).
 */
export function getConfig() {
  return {
    provider: _config.provider,
    model: _config.model,
    hasKey: !!_config.apiKey
  };
}

/**
 * Update provider config. API key stored in-memory only.
 */
export function setConfig({ provider, apiKey, model }) {
  if (provider && (provider === 'anthropic' || provider === 'openrouter')) {
    _config.provider = provider;
    // Set default model for provider if model not explicitly provided
    if (!model) {
      _config.model = PROVIDER_DEFAULTS[provider].model;
    }
  }
  if (apiKey !== undefined) {
    _config.apiKey = apiKey;
  }
  if (model) {
    _config.model = model;
  }
  try { localStorage.setItem('safestay_provider', _config.provider); localStorage.setItem('safestay_model', _config.model); } catch(e) {}
}

/**
 * Get the default model name for a given provider.
 */
export function getDefaultModel(provider) {
  return PROVIDER_DEFAULTS[provider]?.model || '';
}

// ─── Error Normalization ─────────────────────────────────────────────

class LLMError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'LLMError';
    this.code = code; // "AUTH_ERROR" | "RATE_LIMIT" | "NETWORK_ERROR" | "PARSE_ERROR" | "UNKNOWN"
  }
}

function normalizeHttpError(status, responseBody) {
  let snippet = '';
  if (responseBody) {
    snippet = ' - ' + responseBody.substring(0, 200).replace(/["'\n\r]/g, ' ');
  }
  if (status === 401 || status === 403) {
    return new LLMError('Authentication failed. Check your API key.' + snippet, 'AUTH_ERROR');
  }
  if (status === 429) {
    return new LLMError('Rate limit exceeded. Please wait and retry.' + snippet, 'RATE_LIMIT');
  }
  if (status >= 500) {
    return new LLMError('Provider server error. Please try again.' + snippet, 'NETWORK_ERROR');
  }
  return new LLMError(`Request failed with status ${status}.` + snippet, 'UNKNOWN');
}

// ─── Markdown Fence Stripping ────────────────────────────────────────

function stripCodeFences(text) {
  if (!text || typeof text !== 'string') return text;
  // Strip ```json ... ``` or ``` ... ``` wrapping
  const fenceRegex = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/;
  const match = text.trim().match(fenceRegex);
  if (match) {
    return match[1].trim();
  }
  return text.trim();
}

// ─── Core LLM Call ───────────────────────────────────────────────────

/**
 * Main exported function. Calls the configured LLM provider.
 * @param {string} systemPrompt - System-level instructions
 * @param {string} userPrompt - User message content
 * @returns {Promise<string>} - Normalized plain text response (fences stripped)
 * @throws {LLMError} - With .code field for error categorization
 */
export async function callLLM(systemPrompt, userPrompt, signal = null) {
  if (!_config.apiKey) {
    throw new LLMError('No API key configured. Please set your API key in settings.', 'AUTH_ERROR');
  }

  if (_config.provider === 'anthropic') {
    return callAnthropic(systemPrompt, userPrompt, signal);
  } else if (_config.provider === 'openrouter') {
    return callOpenRouter(systemPrompt, userPrompt, signal);
  } else {
    throw new LLMError(`Unknown provider: ${_config.provider}`, 'UNKNOWN');
  }
}

// ─── Anthropic Provider ──────────────────────────────────────────────

async function callAnthropic(systemPrompt, userPrompt, signal = null) {
  const url = 'https://api.anthropic.com/v1/messages';
  const headers = {
    'x-api-key': _config.apiKey,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json'
  };
  const body = {
    model: _config.model,
    max_tokens: 4096,
    temperature: 0.3,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  };

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new LLMError('Request was cancelled.', 'ABORT');
    }
    throw new LLMError(`Network error: ${err.message}`, 'NETWORK_ERROR');
  }

  if (!response.ok) {
    let errorBody = '';
    try { errorBody = await response.text(); } catch(e) {}
    throw normalizeHttpError(response.status, errorBody);
  }

  let data;
  try {
    data = await response.json();
  } catch (err) {
    throw new LLMError('Failed to parse provider response.', 'PARSE_ERROR');
  }

  // Anthropic response: data.content[0].text
  const text = data?.content?.[0]?.text;
  if (!text) {
    throw new LLMError('Empty response from provider.', 'PARSE_ERROR');
  }

  return stripCodeFences(text);
}

// ─── OpenRouter Provider ─────────────────────────────────────────────

async function callOpenRouter(systemPrompt, userPrompt, signal = null) {
  const url = 'https://openrouter.ai/api/v1/chat/completions';
  const headers = {
    'Authorization': `Bearer ${_config.apiKey}`,
    'content-type': 'application/json'
  };
  const body = {
    model: _config.model,
    max_tokens: 4096,
    temperature: 0.3,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]
  };

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new LLMError('Request was cancelled.', 'ABORT');
    }
    throw new LLMError(`Network error: ${err.message}`, 'NETWORK_ERROR');
  }

  if (!response.ok) {
    let errorBody = '';
    try { errorBody = await response.text(); } catch(e) {}
    throw normalizeHttpError(response.status, errorBody);
  }

  let data;
  try {
    data = await response.json();
  } catch (err) {
    throw new LLMError('Failed to parse provider response.', 'PARSE_ERROR');
  }

  // OpenRouter response: data.choices[0].message.content
  const text = data?.choices?.[0]?.message?.content;
  if (!text) {
    throw new LLMError('Empty response from provider.', 'PARSE_ERROR');
  }

  return stripCodeFences(text);
}
