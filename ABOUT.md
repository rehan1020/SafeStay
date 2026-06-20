# About the Project

## Inspiration
Millions of Americans face housing instability, eviction, or unsafe living conditions every year. The first 48 hours of a housing crisis are the most critical, yet accessing legal aid or a caseworker can take weeks. We were inspired by the realization that tenants often miss critical deadlines, fail to document abuse, or abandon their rights simply because they don't know the rules. We wanted to build a digital triage tool that provides immediate, caseworker-grade analysis without the wait.

## What it does
**SafeStay** acts as an immediate, digital caseworker. By typing a simple, freeform description of their housing situation, a tenant receives:
1. An instant assessment of immediate physical danger (Domestic Violence / Crisis).
2. A generated "Fault Map" charting the legal blockers and bypasses.
3. Warnings of hidden flags or disqualification risks.
4. A highly actionable, step-by-step plan prioritizing low-effort, high-impact actions.

## How we built it
We built SafeStay as a 100% client-side application to ensure zero data retention and maximum privacy. The architecture utilizes Vanilla JavaScript, HTML5, and CSS3, heavily relying on the modern DOM and Web APIs. 

To power the intelligence, we integrated a multi-provider LLM abstraction layer supporting Anthropic's Claude 3.5 Sonnet and OpenRouter. We also engineered a zero-latency heuristic engine that intercepts the user's input *before* any network request is made. If tier-1 danger keywords are detected, it instantly renders safety resources.

To conceptualize the urgency and risk internally during the prompt engineering phase, we modeled a tenant's risk profile using a weighted exponential risk function:

$$ \text{Risk}(t) = \alpha \sum_{i=1}^{n} U_i e^{\lambda t} + \beta \sum_{j=1}^{m} V_j $$

Where \(U_i\) represents the urgency of time-sensitive deadlines (e.g., a 3-day pay-or-quit notice), \(V_j\) represents intrinsic vulnerabilities (e.g., undocumented status, children in the home), and \(\lambda\) represents the decay of time available to respond before eviction is finalized.

## Challenges we ran into
One major challenge was dealing with the unpredictable output of LLMs. Because our UI relies on a strict 6-section layout, a broken JSON payload would crash the renderer. We overcame this by engineering a robust regex-based fallback extractor (`caseworkerReasoner.js`) that can parse malformed Markdown and salvage the JSON payload. 

Additionally, we had to manage asynchronous hangs. We built an `AbortController` pipeline that allows users to instantly cancel and restart hanging network requests cleanly. Finally, we faced CORS policy blocks when trying to run ES6 modules locally; we solved this by bundling the application using `esbuild` so it works flawlessly offline and out-of-the-box.

## Accomplishments that we're proud of
We are incredibly proud of the **accessibility and privacy** of the platform. The UI is fully WCAG-compliant with focus management, `aria-live` regions, and screen-reader optimizations. Furthermore, by keeping the application entirely client-side, we guarantee that vulnerable tenants' data never touches an external database. We're also proud of the Responsible AI guardrails we established—the system actively refuses to give definitive legal determinations, instead acting as a bridge to real legal aid.

## What we learned
We learned how to effectively tame LLMs for strict, structured JSON outputs entirely in the browser, without relying on heavy backend frameworks like LangChain or Node.js. We also learned a great deal about the complexities of tenant law and the critical importance of defensive, calming UX design when dealing with users who are experiencing active trauma or panic.

## What's next for SafeStay
In the future, we plan to implement **Geo-Fencing** to dynamically inject state and county-specific tenant laws into the LLM context window based on the user's location. We also want to add **Document Scanning** capabilities using Vision models, allowing users to simply upload a photo of a legal notice to automatically extract deadlines and jurisdiction details.
