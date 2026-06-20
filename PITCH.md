# 🎤 SafeStay — Hackathon Pitch

## The Problem
Millions of Americans face housing instability, eviction, or unsafe living conditions every year. The first 48 hours of a housing crisis are the most critical, yet accessing legal aid or a caseworker can take weeks. Tenants often miss critical deadlines, fail to document abuse, or abandon their rights simply because they don't know the rules.

## The Solution
**SafeStay** is an AI-powered triage tool designed to act as an immediate, digital caseworker. By typing a simple, freeform description of their housing situation, a tenant receives:
1. An instant assessment of immediate physical danger (Domestic Violence / Crisis).
2. A generated "Fault Map" charting the blockers and bypasses of their situation.
3. Warnings of hidden flags or disqualification risks.
4. A highly actionable, step-by-step plan prioritizing low-effort, high-impact actions.

## Why SafeStay?
Unlike general-purpose chatbots (like ChatGPT) which can hallucinate bad legal advice or lead users in circles, SafeStay is:
- **Grounded:** Tied to a specific, hardcoded knowledge base of housing rules.
- **Safe:** It actively refuses to provide definitive legal determinations, instead acting as a bridge to real legal aid by preparing the tenant for their consultation.
- **Adversarial:** The AI is prompted to think like a seasoned social worker, anticipating landlord counter-moves and bureaucratic traps.

## Target Audience
- At-risk tenants facing eviction, habitability issues, or lease disputes.
- Non-profit housing organizations looking for a digital triage tool to prepare intake forms before human consultations.

## Technical Highlights
- **Zero-Latency Safety:** Heuristic parsing detects crisis keywords locally *before* any API call is made, ensuring victims of domestic violence get hotline numbers instantly.
- **Serverless & Secure:** 100% client-side architecture. No databases to breach, no user data stored on our servers.
- **Multi-Provider AI:** Supports Anthropic directly or via OpenRouter, with strict schema enforcement to guarantee consistent UI rendering.

## Future Roadmap
- **Geo-Fencing:** Injecting state and county-specific tenant laws based on user location.
- **Document Scanning:** Allowing users to upload photos of 3-day notices to automatically extract deadlines.
- **Direct Referral:** API integrations with local 211 systems and legal aid clinics to directly submit the generated dossier as an intake form.
