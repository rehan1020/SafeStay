/**
 * renderer.js — Renders the 6-section fault map results.
 * 
 * All content comes from real LLM output, not hardcoded templates.
 * Section 6 (Mandatory Human Referral) renders on EVERY result — 
 * no code path can skip it.
 */

/**
 * Render the instant safety disclaimer for DV/crisis situations.
 * Called IMMEDIATELY when crisis keywords detected, before LLM response.
 */
export function renderInstantSafetyDisclaimer(container) {
  // Don't duplicate if already rendered
  if (container.querySelector('.instant-safety-disclaimer')) return;

  const safetyBlock = document.createElement('div');
  safetyBlock.className = 'result-section instant-safety-disclaimer danger-alert glass-panel';
  safetyBlock.innerHTML = `
    <div class="safety-header">
      <span class="safety-icon">🛡️</span>
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
      <p class="safety-note">Your safety comes first. The analysis below addresses housing options — but please reach out to trained crisis counselors using the numbers above.</p>
    </div>
  `;
  // Insert at the very top of the container
  container.prepend(safetyBlock);
}

function renderToolbar() {
  const toolbar = document.createElement('div');
  toolbar.className = 'results-toolbar';
  toolbar.innerHTML = `
    <button class="toolbar-btn" id="copy-results-btn" type="button">📋 Copy Results</button>
    <button class="toolbar-btn" id="print-results-btn" type="button">🖨️ Print</button>
  `;
  
  toolbar.querySelector('#copy-results-btn').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    let textToCopy = '';
    const container = btn.closest('.output-container');
    const sections = container.querySelectorAll('.result-section');
    sections.forEach(sec => {
      textToCopy += sec.innerText + '\n\n';
    });
    navigator.clipboard.writeText(textToCopy.trim()).then(() => {
      const origText = btn.innerHTML;
      btn.innerHTML = '✓ Copied';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.innerHTML = origText;
        btn.classList.remove('copied');
      }, 2000);
    });
  });

  toolbar.querySelector('#print-results-btn').addEventListener('click', () => {
    window.print();
  });

  return toolbar;
}

/**
 * Render the full 6-section results from LLM pipeline output.
 * @param {HTMLElement} outputContainer 
 * @param {object} pipelineOutput - Full LLM analysis result
 */
export function renderResults(outputContainer, pipelineOutput) {
  pipelineOutput.isDomesticViolence = !!pipelineOutput.isDomesticViolence;

  // Clear previous results (but preserve instant safety disclaimer if present)
  const existingSafety = outputContainer.querySelector('.instant-safety-disclaimer');
  outputContainer.innerHTML = '';
  
  const fragment = document.createDocumentFragment();

  if (existingSafety) {
    fragment.appendChild(existingSafety);
  }

  const toolbar = renderToolbar();
  fragment.appendChild(toolbar);

  // 1. SITUATION SUMMARY
  const summarySection = document.createElement('div');
  summarySection.className = 'result-section summary-section glass-panel';
  summarySection.id = 'section-summary';
  summarySection.innerHTML = `
    <div class="section-header">
      <span class="section-number">01</span>
      <h2>Situation Summary</h2>
    </div>
    <p class="summary-text">${escapeHtml(pipelineOutput.summary || 'Summary unavailable.')}</p>
  `;
  fragment.appendChild(summarySection);

  // 2. FAULT MAP
  const faultMapSection = document.createElement('div');
  faultMapSection.className = 'result-section fault-map-section';
  faultMapSection.id = 'section-faultmap';
  let faultMapHTML = escapeHtml(pipelineOutput.faultMap || 'Fault map unavailable.');
  faultMapHTML = faultMapHTML
    .replace(/(→|↳)/g, '<span class="fm-arrow">$1</span>')
    .replace(/BLOCKER/g, '<span class="fm-blocker">BLOCKER</span>')
    .replace(/BYPASS/g, '<span class="fm-bypass">BYPASS</span>')
    .replace(/PROGRAM/g, '<span class="fm-program">PROGRAM</span>')
    .replace(/EXIT/g, '<span class="fm-exit">EXIT</span>')
    .replace(/YOUR SITUATION|\[YOUR SITUATION\]/g, '<span class="fm-situation">$&</span>');

  faultMapSection.innerHTML = `
    <div class="section-header">
      <span class="section-number">02</span>
      <h2>Fault Map</h2>
    </div>
    <pre class="fault-map"><code>${faultMapHTML}</code></pre>
  `;
  fragment.appendChild(faultMapSection);

  // 3. WHAT MOST PEOPLE MISS
  const missedSection = document.createElement('div');
  missedSection.className = 'result-section missed-section glass-panel';
  missedSection.id = 'section-missed';
  const missedItems = (pipelineOutput.missed || []).slice(0, 3);
  const missedHTML = missedItems.length > 0
    ? missedItems.map(item => `<li><span class="list-icon warning-icon">⚠️</span> ${escapeHtml(item)}</li>`).join('')
    : '<li><span class="list-icon warning-icon">⚠️</span> No hidden flags detected in standard analysis.</li>';
  missedSection.innerHTML = `
    <div class="section-header">
      <span class="section-number">03</span>
      <h2>What Most People Miss</h2>
    </div>
    <ul class="insight-list warning-list">${missedHTML}</ul>
  `;
  fragment.appendChild(missedSection);

  // 4. DISQUALIFIER WARNINGS
  const disqualifierSection = document.createElement('div');
  disqualifierSection.className = 'result-section disqualifier-section glass-panel';
  disqualifierSection.id = 'section-disqualifiers';
  const disqualifierItems = (pipelineOutput.disqualifiers || []).slice(0, 3);
  const disqualifierHTML = disqualifierItems.length > 0
    ? disqualifierItems.map(item => `<li><span class="list-icon danger-icon">🚫</span> ${escapeHtml(item)}</li>`).join('')
    : '<li><span class="list-icon danger-icon">🚫</span> No immediate disqualifier risks detected.</li>';
  disqualifierSection.innerHTML = `
    <div class="section-header">
      <span class="section-number">04</span>
      <h2>Disqualifier Warnings</h2>
    </div>
    <ul class="insight-list error-list">${disqualifierHTML}</ul>
  `;
  fragment.appendChild(disqualifierSection);

  // 5. YOUR ACTION PLAN
  const actionPlanSection = document.createElement('div');
  actionPlanSection.className = 'result-section action-plan-section glass-panel';
  actionPlanSection.id = 'section-actionplan';
  
  const actionItems = (pipelineOutput.actionPlan || []).slice(0, 7);
  let actionRowsHTML = '';
  const sources = new Set();

  actionItems.forEach(step => {
    let urgencyClass = (step.urgency || '').toLowerCase();
    urgencyClass = urgencyClass.replace(/[^a-z0-9\-]/g, '');
    let effortClass = (step.effort || '').toLowerCase();
    effortClass = effortClass.replace(/[^a-z0-9\-]/g, '');
    actionRowsHTML += `
      <tr>
        <td class="rank-cell">${escapeHtml(step.rank ? String(step.rank) : '')}</td>
        <td class="action-cell">${escapeHtml(step.action || '')}</td>
        <td><span class="badge urgency-${urgencyClass}">${escapeHtml(step.urgency || '')}</span></td>
        <td><span class="badge effort-${effortClass}">${escapeHtml(step.effort || '')}</span></td>
        <td class="unlocks-cell">${escapeHtml(step.unlocks || '')}</td>
      </tr>
    `;
    if (step.source_rule) {
      sources.add(step.source_rule);
    }
  });

  const sourcesHTML = sources.size > 0
    ? `<div class="action-sources">${[...sources].map(s => `<span class="source-tag">📌 ${escapeHtml(s)}</span>`).join(' ')}</div>`
    : '';

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

  // 6. MANDATORY HUMAN REFERRAL — ALWAYS renders, no code path can skip this
  const disclaimerSection = document.createElement('div');
  disclaimerSection.className = 'result-section disclaimer-section glass-panel';
  disclaimerSection.id = 'section-referral';
  disclaimerSection.innerHTML = `
    <div class="section-header">
      <span class="section-number">06</span>
      <h2>Mandatory Human Referral</h2>
    </div>
    <div class="legal-disclaimer">
      <div class="disclaimer-divider"></div>
      <p><strong>⚖️ SafeStay does not make legal determinations.</strong></p>
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

  // Animate sections in with stagger
  const sections = outputContainer.querySelectorAll('.result-section');
  sections.forEach((section, index) => {
    section.style.animationDelay = `${index * 0.1}s`;
    section.classList.add('animate-in');
  });
}

/**
 * Hard fallback render — ensures Section 6 appears even if pipelineOutput is malformed.
 */
export function renderFallback(outputContainer) {
  renderResults(outputContainer, {
    summary: 'We encountered an issue analyzing your situation. Please see the general guidance below.',
    faultMap: '[YOUR SITUATION]\n  → [STATUS: Analysis temporarily unavailable]\n      ↳ NEXT STEP: Contact local housing legal aid directly\n  → [EXIT: Human referral required]',
    missed: ['Always document all communications with your landlord in writing'],
    disqualifiers: ['Missing court deadlines can result in default judgments'],
    actionPlan: [{
      rank: 1,
      action: 'Contact local housing legal aid for a free consultation',
      urgency: 'THIS WEEK',
      effort: 'LOW',
      unlocks: 'Expert assessment of your specific rights',
      source_rule: 'general_guidance'
    }],
    isDomesticViolence: false
  });
}

// ─── Utility ─────────────────────────────────────────────────────────

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
