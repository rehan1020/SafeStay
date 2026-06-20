/**
 * app.js — SafeStay MVP Application Controller
 * 
 * State machine: LANDING → SUBMIT → (FOLLOWUP?) → PROCESSING → RESULTS
 * 
 * Replaces the old chat-based turn-by-turn pattern entirely.
 * Uses single-intake textarea with optional inline follow-up.
 */

import { runPipeline, checkCrisisKeywords } from './agents/index.js';
import { renderResults, renderInstantSafetyDisclaimer, renderFallback } from './renderer.js';
import { getConfig, setConfig, getDefaultModel } from './agents/llmClient.js';

// ─── Constants ───────────────────────────────────────────────────────
const PROCESSING_TIMEOUT_MS = 60000; // 60s max timeout for LLM call
const FOLLOWUP_FIELD_MAP = {
  urgency: {
    label: 'How soon do you need to act?',
    chips: ['Today / Immediately', 'Within days', 'Within weeks', 'Within months']
  },
  trigger: {
    label: 'What caused this situation?',
    chips: ['Eviction notice', 'Job loss / can\'t pay rent', 'Domestic violence', 'Lease ending / not renewed', 'Habitability issues', 'Other']
  },
  housing_type: {
    label: 'What is your housing situation?',
    chips: ['Renting apartment/house', 'Informal arrangement (no lease)', 'In shelter / unhoused', 'Own my home']
  }
};

// ─── App Class ───────────────────────────────────────────────────────
class SafeStayApp {
  constructor() {
    // DOM Elements
    this.heroSection = document.getElementById('hero-section');
    this.intakeSection = document.getElementById('intake-section');
    this.intakeForm = document.getElementById('intake-form');
    this.situationInput = document.getElementById('situation-input');
    this.charCount = document.getElementById('char-count');
    this.followupSection = document.getElementById('followup-section');
    this.followupPrompt = document.getElementById('followup-prompt');
    this.followupChips = document.getElementById('followup-chips');
    this.intakeError = document.getElementById('intake-error');
    this.submitButton = document.getElementById('submit-button');
    this.processingSection = document.getElementById('processing-section');
    this.outputContainer = document.getElementById('output-container');
    this.restartSection = document.getElementById('restart-section');
    this.restartButton = document.getElementById('restart-button');

    // Settings DOM
    this.settingsToggle = document.getElementById('settings-toggle');
    this.settingsOverlay = document.getElementById('settings-overlay');
    this.settingsPanel = document.getElementById('settings-panel');
    this.settingsClose = document.getElementById('settings-close');
    this.settingsForm = document.getElementById('settings-form');
    this.providerSelect = document.getElementById('provider-select');
    this.apiKeyInput = document.getElementById('api-key-input');
    this.modelInput = document.getElementById('model-input');
    this.modelHint = document.getElementById('model-hint');
    this.settingsError = document.getElementById('settings-error');

    // State
    this.isFollowUp = false;
    this.originalInput = '';
    this.followUpSelections = {};
    this.abortController = null;
    this.elapsedInterval = null;

    this.init();
  }

  init() {
    // Intake form
    this.intakeForm.addEventListener('submit', (e) => this.handleSubmit(e));
    
    // Character count
    this.situationInput.addEventListener('input', () => {
      const len = this.situationInput.value.length;
      this.charCount.textContent = `${len} / 5,000`;
    });

    // Example chips
    document.querySelectorAll('.example-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        this.situationInput.value = chip.dataset.scenario;
        const len = chip.dataset.scenario.length;
        this.charCount.textContent = `${len} / 5,000`;
        this.situationInput.focus();
      });
    });

    // Settings panel
    this.settingsToggle.addEventListener('click', () => { console.log('TOGGLE CLICKED'); this.openSettings(); });
    this.settingsClose.addEventListener('click', () => this.closeSettings());
    this.settingsOverlay.addEventListener('click', (e) => {
      if (e.target === this.settingsOverlay) this.closeSettings();
    });
    this.settingsForm.addEventListener('submit', (e) => this.saveSettings(e));
    this.providerSelect.addEventListener('change', () => this.onProviderChange());

    // Restart button
    this.restartButton.addEventListener('click', () => this.restart());

    // Keyboard: Escape to close settings
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.settingsOverlay.classList.contains('hidden')) {
        this.closeSettings();
      }
    });

    // Initialize settings panel with current config
    this.syncSettingsUI();
    const config = getConfig();
    if (config.hasKey) {
      this.settingsToggle.classList.add('key-configured');
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
    if (provider === 'openrouter') {
      this.modelHint.textContent = 'OpenRouter supports many models — edit freely (e.g., anthropic/claude-sonnet-4-20250514, google/gemini-2.5-pro)';
    } else {
      this.modelHint.textContent = 'Anthropic direct API — typically claude-sonnet-4-20250514 or claude-3-5-haiku-20241022';
    }
  }

  onProviderChange() {
    const provider = this.providerSelect.value;
    this.modelInput.value = getDefaultModel(provider);
    this.updateModelHint();
  }

  openSettings() {
    this.settingsOverlay.classList.remove('hidden');
    this.settingsError.classList.add('hidden');
    this.apiKeyInput.focus();
  }

  closeSettings() {
    this.settingsOverlay.classList.add('hidden');
  }

  saveSettings(e) {
    e.preventDefault();
    
    const provider = this.providerSelect.value;
    const apiKey = this.apiKeyInput.value.trim();
    const model = this.modelInput.value.trim();

    if (!apiKey) {
      this.showSettingsError('Please enter your API key.');
      return;
    }

    if (!model) {
      this.showSettingsError('Please specify a model name.');
      return;
    }

    // Store in memory only — NEVER logged, NEVER persisted
    setConfig({ provider, apiKey, model });
    this.settingsToggle.classList.add('key-configured');
    
    this.settingsError.classList.add('hidden');
    this.closeSettings();
    this.hideIntakeError();
  }

  showSettingsError(msg) {
    this.settingsError.textContent = msg;
    this.settingsError.classList.remove('hidden');
  }

  // ─── Intake & Submission ─────────────────────────────────────────

  async handleSubmit(e) {
    e.preventDefault();
    this.submitButton.disabled = true;
    this.hideIntakeError();

    // Check if API is configured
    const config = getConfig();
    if (!config.hasKey) {
      this.showIntakeError('Please configure your API provider and key first.');
      this.openSettings();
      this.submitButton.disabled = false;
      return;
    }

    const rawText = this.situationInput.value.trim();
    if (!rawText && !this.isFollowUp) {
      this.showIntakeError('Please describe your housing situation.');
      this.submitButton.disabled = false;
      return;
    }

    if (rawText.length > 5000) {
      this.showIntakeError('Please keep your description under 5,000 characters.');
      this.submitButton.disabled = false;
      return;
    }

    if (this.isFollowUp && Object.keys(this.followUpSelections).length === 0) {
      this.showIntakeError('Please select at least one option above before continuing.');
      this.submitButton.disabled = false;
      return;
    }

    // Build combined text (original + follow-up selections if any)
    let combinedText;
    if (this.isFollowUp) {
      const followUpParts = Object.entries(this.followUpSelections)
        .map(([field, value]) => `${field}: ${value}`)
        .join('. ');
      combinedText = `${this.originalInput}\n\nAdditional details: ${followUpParts}`;
    } else {
      combinedText = rawText;
    }

    this.abortController = new AbortController();

    // Transition to processing
    this.showProcessing();

    // Check for crisis keywords client-side BEFORE network call
    const isCrisis = checkCrisisKeywords(combinedText);
    if (isCrisis) {
      // Render instant safety disclaimer immediately — don't wait for LLM
      this.outputContainer.innerHTML = '';
      this.outputContainer.classList.remove('hidden');
      renderInstantSafetyDisclaimer(this.outputContainer);
    }

    // Call LLM pipeline with timeout
    let timeoutId;
    try {
      const result = await Promise.race([
        runPipeline(combinedText, this.abortController.signal),
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('TIMEOUT')), PROCESSING_TIMEOUT_MS);
        })
      ]);
      clearTimeout(timeoutId);

      // Handle follow-up needed
      if (result.needsFollowUp && result.profile?.missing_fields?.length > 0) {
        this.originalInput = combinedText;
        this.showFollowUp(result.profile.missing_fields);
        this.submitButton.disabled = false;
        return;
      }

      // Render full results
      this.showResults(result);

    } catch (error) {
      clearTimeout(timeoutId);
      this.handleError(error);
    }
  }

  // ─── Follow-up Logic ─────────────────────────────────────────────

  showFollowUp(missingFields) {
    this.hideProcessing();
    this.heroSection.classList.add('hidden');
    this.intakeSection.classList.remove('hidden');
    this.isFollowUp = true;

    // Build follow-up UI inline below textarea
    this.followupPrompt.textContent = 'We need a bit more detail to give you accurate guidance:';
    this.followupChips.innerHTML = '';

    missingFields.forEach(field => {
      const fieldConfig = FOLLOWUP_FIELD_MAP[field];
      if (!fieldConfig) return;

      const fieldContainer = document.createElement('div');
      fieldContainer.className = 'followup-field-group';

      const label = document.createElement('p');
      label.className = 'followup-field-label';
      label.textContent = fieldConfig.label;
      label.style.cssText = 'font-size:0.85rem;color:var(--text-muted);margin-bottom:0.4rem;margin-top:0.6rem;';
      fieldContainer.appendChild(label);

      const chipsRow = document.createElement('div');
      chipsRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:0.4rem;';

      fieldConfig.chips.forEach(chipText => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'followup-chip';
        chip.textContent = chipText;
        chip.setAttribute('aria-pressed', 'false');
        chip.addEventListener('click', () => {
          // Deselect siblings
          chipsRow.querySelectorAll('.followup-chip').forEach(c => {
            c.classList.remove('selected');
            c.setAttribute('aria-pressed', 'false');
          });
          chip.classList.add('selected');
          chip.setAttribute('aria-pressed', 'true');
          this.followUpSelections[field] = chipText;
        });
        chipsRow.appendChild(chip);
      });

      fieldContainer.appendChild(chipsRow);
      this.followupChips.appendChild(fieldContainer);
    });

    this.followupSection.classList.remove('hidden');
    this.submitButton.querySelector('.btn-text').textContent = 'Continue Analysis';
    
    this.followupSection.tabIndex = -1;
    this.followupSection.focus();
  }

  // ─── Error Handling ──────────────────────────────────────────────

  handleError(error) {
    if (error?.code === 'ABORT' || error?.name === 'AbortError') return;

    this.submitButton.disabled = false;
    console.warn('Pipeline error:', error?.message || error);

    if (error?.message === 'TIMEOUT') {
      // Timeout — fall back to safe state via renderer
      this.outputContainer.classList.remove('hidden');
      renderFallback(this.outputContainer);
      this.showResultsUI();
      return;
    }

    const code = error?.code;

    switch (code) {
      case 'AUTH_ERROR':
        this.hideProcessing();
        this.intakeSection.classList.remove('hidden');
        this.showIntakeError('Your API key appears invalid. Please check your settings.');
        this.openSettings();
        return;

      case 'RATE_LIMIT':
      case 'NETWORK_ERROR': {
        this.hideProcessing();
        this.intakeSection.classList.remove('hidden');
        const message = code === 'RATE_LIMIT' 
          ? 'Too many requests right now. Please wait a moment and try again.'
          : 'We\'re having trouble connecting. Please check your connection and try again.';
        
        this.showIntakeError(message);
        
        // Add retry button
        const retryBtn = document.createElement('button');
        retryBtn.className = 'retry-btn';
        retryBtn.textContent = 'Retry';
        retryBtn.type = 'button';
        retryBtn.addEventListener('click', () => {
          this.hideIntakeError();
          this.intakeForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        });
        this.intakeError.appendChild(retryBtn);
        return;
      }

      case 'PARSE_ERROR':
      default:
        // Fall back to safe-state response — never show broken/empty UI
        this.outputContainer.classList.remove('hidden');
        renderFallback(this.outputContainer);
        this.showResultsUI();
        return;
    }
  }

  // ─── View Transitions ────────────────────────────────────────────

  showProcessing() {
    this.heroSection.classList.add('hidden');
    this.intakeSection.classList.add('hidden');
    this.followupSection.classList.add('hidden');
    this.processingSection.classList.remove('hidden');
    this.outputContainer.classList.add('hidden');
    this.restartSection.classList.add('hidden');

    const elapsedEl = document.getElementById('elapsed-timer');
    let seconds = 0;
    if (elapsedEl) {
      elapsedEl.textContent = '';
      this.elapsedInterval = setInterval(() => {
        seconds++;
        elapsedEl.textContent = `${seconds}s elapsed`;
      }, 1000);
    }
    const procText = this.processingSection.querySelector('.processing-text');
    if (procText) {
      procText.tabIndex = -1;
      procText.focus();
    }
  }

  hideProcessing() {
    this.processingSection.classList.add('hidden');
    clearInterval(this.elapsedInterval);
    this.elapsedInterval = null;
  }

  showResults(pipelineOutput) {
    this.outputContainer.classList.remove('hidden');
    renderResults(this.outputContainer, pipelineOutput);
    this.showResultsUI();
  }

  showResultsUI() {
    this.hideProcessing();
    this.heroSection.classList.add('hidden');
    this.intakeSection.classList.add('hidden');
    this.outputContainer.classList.remove('hidden');
    this.restartSection.classList.remove('hidden');

    this.submitButton.disabled = false;

    // Scroll to top of results
    this.outputContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    this.outputContainer.tabIndex = -1;
    this.outputContainer.focus();
  }

  restart() {
    this.abortController?.abort();
    this.submitButton.disabled = false;

    // Reset state
    this.isFollowUp = false;
    this.originalInput = '';
    this.followUpSelections = {};

    // Reset UI
    this.situationInput.value = '';
    this.charCount.textContent = '0 / 5,000';
    this.followupSection.classList.add('hidden');
    this.followupChips.innerHTML = '';
    this.hideIntakeError();
    this.submitButton.querySelector('.btn-text').textContent = 'Analyze My Situation';

    // Show landing + intake
    this.heroSection.classList.remove('hidden');
    this.intakeSection.classList.remove('hidden');
    this.processingSection.classList.add('hidden');
    this.outputContainer.classList.add('hidden');
    this.outputContainer.innerHTML = '';
    this.restartSection.classList.add('hidden');

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.situationInput.focus();
  }

  showIntakeError(msg) {
    this.intakeError.textContent = msg;
    this.intakeError.classList.remove('hidden');
    this.intakeError.tabIndex = -1;
    this.intakeError.focus();
  }

  hideIntakeError() {
    this.intakeError.classList.add('hidden');
  }
}

// ─── Initialize ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  try {
    window.safeStayApp = new SafeStayApp();
  } catch (e) {
    const errDiv = document.createElement('div');
    errDiv.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:white; color:red; z-index:99999; padding:20px; font-family:monospace; overflow:auto;';
    errDiv.innerHTML = '<h2>Initialization Error</h2><pre>' + e.stack + '</pre>';
    document.body.appendChild(errDiv);
    console.error(e);
  }
});
