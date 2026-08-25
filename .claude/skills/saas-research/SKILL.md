---
name: saas-research
description: Find and validate micro-SaaS ideas with real demand evidence (traffic, pain signals, willingness-to-pay). Use for BOOTSTRAP Phases A1–A2 — producing 5 evidenced ideas, per-idea market research, and a weighted scorecard that feeds the founder's product decision. Use whenever the user asks for SaaS/app ideas, niche research, market validation, or "what should I build".
---

# SaaS Research — Idea Discovery & Validation

Executes `docs/BOOTSTRAP.md` Phase A (A1 idea search → A2 market research → scorecard for the A3
decision). Distilled from `references/playbook.md` (5 practitioner methodologies + 2025–2026 web
research) — read it for depth; this file is the executable process.

## The core loop (everything below is a variation of it)

> **Find where demand already exists but the solution is weak → narrow to a niche you can win →
> confirm people will pay → build the smallest thing.**

## Iron rules

1. **Do not invent a novel idea in an unproven market.** Competition = validation. The edge is
   positioning, distribution, and speed — not novelty. 0–1 competitors is a red flag, not a
   blue ocean.
2. **AI reasons; metrics come from real tools.** Never present model-estimated volumes/CPC/KD as
   fact — pull from an SEO MCP (DataForSEO / Semrush / Ahrefs / GSC) when configured, else free
   tools (Google Trends, Keyword Planner) via browsing, else mark **[Unverified]**.
3. **Never invent quotes.** Pain evidence is verbatim + permalink, or it doesn't count.
4. **The reusable opportunity filter:** KD **< 20–30** + CPC **> $5–10** (buyer money) +
   commercial/pain intent + a **weak SERP** (page-1 with DA/DR<20, thin/stale content, or
   Reddit/Quora threads ranking = nobody owns it).
5. **Distribution is the #1 silent killer** — an idea without a reachable channel scores itself
   out, no matter how painful the problem.

## Process

### Step 1 — Pick hunting grounds (with the user)
Evergreen market (Health/Wealth/Relationships/B2B ops) or a vertical the founder knows; list the
SaaS they already pay for (best seed per Gawley); default B2B, web-first, $3k–$50k MRR scale.

### Step 2 — Run the four lenses in parallel (an idea surfacing in ≥2 lenses is a strong signal)

**Lens A — SEO economics** (most reproducible): keyword-gap vs 3–4 incumbents; hunt 3+ word
"[tool] for [niche]" long-tails; apply the filter from rule 4; ALWAYS read the SERP for weakness
(low-authority domains, stale content, forum threads at positions 4–10; bail if the whole top-5
has 50+ referring domains). Intent modifiers that signal ideas: `alternative`, `migrate from`,
`too expensive`, `is there a tool that`, `spreadsheet/manually`, `[software] for [profession]`,
`template/calculator/generator/tracker`.

**Lens B — Trends & waves**: Google Trends → Rising/Breakout, Topics over terms, require a
sustained 6–12-month uptrend (not a spike). Ask "**why now?**" — platform shifts (MCP servers,
ChatGPT Apps SDK, voice agents), marketplace economics (Shopify 100%-of-first-$1M), and
**regulation deadlines** (EU Accessibility Act, e-invoicing/ViDA, EU AI Act, US state privacy)
are recurring-revenue wedges. Moat test — need ≥2 of: proprietary data, embedded workflow,
regulatory lock-in, distribution.

**Lens C — Community & marketplace pain mining**: the universal tells are
`"is there a tool that…" / "I wish there was…" / "someone should build…" / "how do I automate…"`.
- Reddit via Google: `site:reddit.com ("is there a tool" OR "i wish there was" OR "someone should build" OR "how do I automate") [niche] after:<last-18mo>`
- Negative reviews (1–3★ = pre-validated demand): G2 "Lowest Rated" dislike fields, Capterra cons,
  Shopify `?ratings[]=1`, Apple RSS JSON feed. 3–4★ "love it but missing X" maps the wedge.
- Marketplace gaps: high installs + <4.0★ + stale updates (Chrome MV3 die-off, WordPress plugin
  API, Zapier/Make missing-connector probing, HubSpot Ideas board).
- Freelance/job boards: people repeatedly PAYING for the same rule-based manual task = proven WTP.
- One complaint is noise; **the same complaint across 10+ posts is a signal**.

**Lens D — Copy & reposition** (lowest risk): proven product (IndieHackers $3k–$50k MRR,
Acquire.com listings, top-grossing charts, a SaaS the founder pays for) + ONE differentiation
move: niche-down · light/cheaper · local/language · compliance · combine 2–3 products ·
reverse-engineer the tech · productize a service.

Prompt library (grounded extraction, clustering, scoring, discovery queries):
`references/playbook.md` Part 4 — use verbatim.

### Step 3 — Shortlist & score (the A2 deliverable)

Weighted scorecard per idea (1–5 × weight, max 90): Pain intensity ×3 · WTP ×3 · Demand evidence
×2 · Competition health ×2 (2–10 competitors with broken execution = healthy) · Solo-build
feasibility ×2 (MVP ≤4 weeks) · **Distribution ×3** · Differentiation ×2 · Stickiness ×1.
**≥70 build · 54–69 validate harder · <54 kill.** Hard vetoes (any one = bail): pain=1 ·
distribution=1 · 0–1 competitors.

### Step 4 — Outputs (contract with BOOTSTRAP)

- `research/ideas.md` — **5 ideas**, each: one-liner · niche/ICP · the demand evidence (keyword
  numbers with source, pain quotes with permalinks, competitor revenue signals) · which lenses
  surfaced it · proposed wedge/positioning.
- `research/market-<idea>.md` ×5 — competitors + pricing norms, channel analysis, why-now,
  realistic MRR comps (median profitable micro-SaaS ≈ $4.2k MRR; ~70% never break $1k — set
  expectations honestly), scorecard row rationale.
- `research/scorecard.md` — the table, sorted, with vetoes flagged and a recommendation. **The
  founder decides (gate G1); the skill recommends, never decides.**

### Step 5 — Pre-build validation assets (on request, after G1)
Fake-door landing page brief (one ICP, visible price, one CTA; pass bar 5–10% opt-in, <2% kill) ·
cold-outreach script (20 DMs; pass 10+ signups AND 3+ "I'd pay") · Mom-Test interview guide (past
behavior only) · pre-sell framing (**3+ paid commitments = build; waitlist signups don't count**;
exception: Starter Story's 100-waitlist bar for consumer). Set the pass bar BEFORE seeing data.

## Tooling

WebSearch/WebFetch always. SEO MCPs when configured (DataForSEO cheapest, Semrush per the
playbook's discovery prompt, GSC free on own data); Apify MCP for Reddit/review scraping;
Google Trends free. Degrade gracefully — missing tool ⇒ narrower claim + [Unverified] marker,
never a made-up number. Full tooling cheat-sheet: `references/playbook.md` Appendix.
