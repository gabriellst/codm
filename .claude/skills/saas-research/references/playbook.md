# How to Find Micro‑SaaS Ideas — Deep Research Playbook

*A synthesis of 5 YouTube methodologies + current (2025–2026) web research on online search, SEO, trends, community mining, and validation. Built to be executed, not just read.*

**Researched:** June 2026 · **Scope:** idea discovery → validation (pre‑build). Build/launch are out of scope.

> **Reliability note:** Specific revenue/valuation figures cited from videos and press (e.g. "$90k/month", "$1M idea", startup valuations) are **claims, not audited facts** — treat as directional. SEO metric thresholds and validation numbers are practitioner rules‑of‑thumb that recur across independent sources. Pricing was checked mid‑2026; verify before buying.

---

## 0. The one-page summary

Every credible method below is a variation on **one loop**:

> **Find where demand already exists but the solution is weak → narrow to a niche you can win → confirm people will pay → build the smallest thing.**

The five sources disagree mostly on *where to look for the demand signal*:

| Source | Core signal it hunts | One‑line method |
|---|---|---|
| **Dennis Babych** (59 ideas/week) | Already‑validated businesses | Copy + recombine proven products, niche down, go local/vertical |
| **Starter Story** (Reddit + Claude) | Raw human pain on Reddit | AI mines complaints → clusters → idea → landing page in ~45 min |
| **Steven Cravotta** ($90k/mo apps) | App‑store revenue + social virality | Solve a painful, *marketable* problem competitors already monetize |
| **Kyle Gawley** ("STOP looking") | Existing profitable SaaS | Don't invent — copy a proven SaaS, win on **positioning** (niche/light) |
| **Lukas Margerie** (Semrush MCP) | SEO keyword economics | Low‑difficulty + high‑CPC keywords = validated, monetizable wedge |

**The biggest cross‑cutting agreement (all 5):** *Do not invent a brand‑new idea in an unproven market.* Competition is **validation**, not a deterrent. The edge is **positioning, distribution, and speed** — not novelty. The hard part isn't the idea; it's picking a niche you can reach and proving willingness‑to‑pay before you build.

**The single most reusable filter in this whole document** (from the SEO research):

> A micro‑SaaS opportunity ≈ **Keyword Difficulty < 20–30 + CPC > ~$5–10 (buyer money) + commercial/pain intent + a *weak* SERP** (page‑1 results with low authority, or Reddit/Quora/forum threads ranking = nobody owns it yet).

---

## Part 1 — What each video actually teaches

### 1.1 Dennis Babych — "Find 59 Micro‑SaaS Ideas in 1 Week" (volume + ethical copying)

**Philosophy:** One idea won't make you — *volume* does ("only ~5–10% of ideas survive"). So run an idea *factory*. Default to **B2B** ("businesses pay more, complain less"), **web first** (never start mobile), and target Indie‑Hacker‑scale businesses (**$3k–$50k MRR**).

**The "ethically steal" thesis:** A competitor existing = the idea is *already validated*. Grab the validated concept/problem/audience, then differentiate. (Like a city supporting another taco shop.)

**His idea‑generation engines (a menu — run all of them):**

1. **Recombine two products** — take the concept of product A + product B, fuse with AI, apply to a micro‑niche.
2. **Mine validated‑business directories:**
   - **IndieHackers.com** → filter: revenue **$3k–$50k/mo**, **solo** founders, **self‑funded**, **web**, **B2B**.
   - **Acquire.com** → SaaS businesses *for sale* = validated ideas to recreate for a niche.
3. **Niche down** (healthcare → just dentists) and **go micro** (a full SEO suite → *only* an AI long‑tail keyword tool).
4. **Go local** ("an absolute game‑changer") — Stripe → a local payment provider; clone a tool into your language/country (many people don't speak English; e.g. a local‑language Mailchimp).
5. **No‑backend deliverable** — sell a Figma file / spreadsheet / template instead of software.
6. **Concierge / Wizard‑of‑Oz** — blank dashboard, you do the work manually first, automate later ("Amazon Go was guys in India watching cameras").
7. **Directory play** — build a directory of alternatives for a niche/local market.
8. **Reverse‑engineer** — find the tech behind a product (e.g. Photo AI runs on the Flux model) and reuse it.
9. **Mine negative reviews** — read **G2** 1‑star reviews of a tool (his example: Twilio) → complaints = your next product.
10. **Acquisition mining** — **Crunchbase → company → Financials → Acquisitions**: what big companies bought reveals market gaps. Follow founders who announce small exits.
11. **Competitor keyword mining** — extract the keywords a big company ranks for (e.g. Canva → "resume templates", "cover letter templates" → reveals the "how to find a job" market) → build a free lead‑gen tool + paid service.
12. **Product Hunt recombination** — combine *three* PH products into one (link generator + screenshot API + nice analytics dashboard = "generate links via API that auto‑produce a beautiful dashboard").

**Quick‑validation rules:** build traffic *first* (SEO/YouTube/X); add ideas to a list and **sleep on them**; prioritize anything launchable in **1–2 weeks**; price **$100–$300/mo** or one‑time; *anchoring trick* — "if you're scared to charge >$25/mo, bill it annually." Always end customer chats asking for an **introduction**.

### 1.2 Starter Story — "Use AI to Find a $1M Idea [Reddit, Claude]" (AI pain‑mining)

**Thesis:** Your brain is biased; outsource ideation to AI. Mine *real* pain from Reddit (where people talk anonymously), in evergreen markets where people *always* spend: **Health, Wealth, Relationships.** Target **human‑need trends** (grow for years) over **hype trends** (spike and die in ~3 months). "Six tools, five prompts, 45 minutes."

**The workflow:**
1. **Pick a market** in Health/Wealth/Relationships where you have an edge → use a *Market Idea Expander* prompt to drill into sub‑sub‑niches.
2. **Validate demand:** Google + **Keywords Everywhere** for volume; look for "solution‑aware" queries ("[niche] app/classes/counseling"). Then **Google Trends** — prefer a **Topic** over a search term, and a **steady, low‑fluctuation, growing** trend (his example: *co‑parenting*, ~40k searches, solid uptrend) over a spiky one (massage).
3. **Mine Reddit:** a special `site:reddit.com` query with pain‑filter words surfaces complaint threads. Copy the best threads (high comment counts, clear problem framing) into a doc, separated by `---`. (Companion doc holds the exact prompts.)
4. **Process with Claude (3 prompts in sequence, one chat):**
   - **Pain‑Point Extractor** → each pain = title + description + *verbatim quotes*.
   - **Market‑Gap Generator** (trained on "new paradigm / new tech / differentiation") → segmentation framework + ~3 concrete ideas + differentiation framework.
   - **Landing‑Page Prompt Creator** ("a prompt that makes a prompt") → outputs an optimized master prompt for **Lovable**.
5. **Build the landing page** in Lovable → publish. (Demo result: "Transition Garden," a child‑centered custody‑transition tool — copy mirrors Reddit users' exact words.)
6. **Validate:** landing‑page popup → short quiz → waitlist. Rule of thumb he gives: **"at 100 waitlist signups, build it."**

> *Note: the literal prompt text lives in his free companion doc, not the video. The behaviors are reproducible from the descriptions above; see the prompt library in Part 4.*

### 1.3 Steven Cravotta — "App Ideas That Print ($90k/mo)" (app‑store + virality)

**Thesis:** Most apps fail because the idea was never validated — and **"marketing is 95% of the success."** As AI makes *building* trivial, **distribution is the moat.** Solve one painful problem, one feature.

**4 steps:**
1. **Find** a painful, popular problem in health/wealth/relationships/status/convenience. **Controversy is a marketing multiplier** (his vaping‑tracker "PuffCount" grew on hate‑comments to 120k followers, $44k MRR before sale).
2. **Validate** it's trending *and* competitors make money (competition = good).
3. **Marketability test** = the *instant demand check*: search your keyword on **TikTok**, sort by "most‑liked of all time." Viral videos = proven demand + a content blueprint.
4. **Feasibility:** simplicity wins (cites a QR‑reader doing ~$10M). Ship fast; don't chase perfection.

**His tool stack:** App Store top‑grossing charts, **Sensor Tower** (revenue estimates), **Google Trends** ("is it up‑and‑to‑the‑right?"), **Flippa** + **Acquire.com** (sort apps by revenue to see what sells), and his favorite — **viraladlibrary.com** (most‑viral app videos + view counts for competitor research). Demand read = revenue estimate + rising search trend + social virality.

### 1.4 Kyle Gawley — "STOP looking for SaaS Ideas" (copy + position)

**Contrarian thesis:** Never hunt for ideas from "X SaaS ideas" lists. **People pay to solve problems, not for ideas.** Taking a stranger's idea forces you to validate market + problem + willingness‑to‑pay *and* educate the market — that's expensive, slow, VC‑territory. As a bootstrapper, that kills you.

**Do instead:** **Copy a SaaS that already works in a big, competitive market** (ideally with huge incumbents making hundreds of millions — proof of demand and WTP). Then win on **positioning**:
- **Niche down** — invoicing tool → invoicing *for therapists / web designers*. (Too small for incumbents, big enough for you.)
- **Build a "light"/cheaper version** — his **Alertly** is a light social‑listening tool ($29–$100/mo) vs. enterprise incumbents Brandwatch/Brand24/Mention ($500/mo/seat). "I didn't create a new market — I just **positioned** a solution."
- **Best seed = a problem you personally have.** Look at the SaaS you *already pay for*, then do it differently/better for a subset of users.

Target a **lifestyle/sellable‑in‑4–5‑years** outcome, not a $100M company.

### 1.5 Lukas Margerie — "Claude Code / Codex as a SaaS Idea Engine via Semrush MCP" (SEO economics)

**Thesis:** Building is now cheap (Lovable/Claude Code/Codex build apps in a day); *deciding what to build* is the hard part. **Keyword data reveals validated, monetizable, low‑competition demand** before you build. (Method credited to Danny Postma, of Headshot Pro.)

**The 3 criteria + thresholds he targets:**
| Metric | Target |
|---|---|
| Keyword Difficulty (KD) | **< 20%** |
| Cost‑per‑click (CPC) | **> $1** (uses **$2** in prompt) — high CPC = buyers with money |
| Search volume | **≥ 100/mo** floor, **ideally > 500/mo** |
| Plus | 12‑month growth, transactional/commercial intent, US as primary market, weak SERP |

**Workflow:** install the **Semrush plugin/MCP** in Codex (or Claude Code) → authenticate → run the discovery prompt (see Part 4) → get 20 keyword opportunities → manually verify the best in Semrush (KD, US market, **SERP analysis** — he found "AI photo booth" had a weak Webflow incumbent whose only CTA was "book a demo") → lock the niche → map a **content cluster** (blog posts → free tool → paid tool) → build the funnel (free "try one theme" image tool → blurred paywalled results via **Stripe**) → ship via **Vercel** plugin. The funnel logic: **content cluster → free micro‑tool → paid SaaS.**

---

## Part 2 — The unified idea-discovery system

Four discovery "lenses." Run several in parallel; the same idea showing up in two lenses is a strong signal.

### Lens A — Online search & SEO (the most reproducible)

**A1. Keyword‑gap mining.** In Ahrefs (**Content Gap**) or Semrush (**Keyword Gap**), enter 3–4 incumbent domains → pull the **Missing/Untapped** keywords they rank for. Filter **KD < 30, volume ≥ 100, sort by CPC descending**, intent = commercial/transactional.

**A2. The long‑tail difficulty collapse.** Modifiers crater difficulty: "best CRM" (KD 85) → "best CRM for nonprofits" (KD 11). Always hunt **3+ word** "[tool] for [niche]" phrases.

**A3. SERP‑weakness reading (do this every time — low KD alone is a trap).** Search in incognito, score the top 10, and look for **3–5+ weak pages**: domains with **DA/DR < 20**, thin/outdated content (no update in 2+ yrs, <1,000 words), or **Reddit/Quora/forum threads ranking** = nobody owns the keyword. Focus on positions **4–10**, not #1. **Bail** if the whole top‑5 has 50+ referring domains. Tool: **LowFruits** scores SERP weakness automatically; **Keyword Golden Ratio** (`allintitle ÷ volume < 0.25`) is a free pre‑filter.

**A4. Intent modifiers that signal an idea** (search these against any niche):

| Group | Modifiers | Signal |
|---|---|---|
| Comparison | best, top, vs, **alternative**, competitors, review | What people want to *replace* |
| Transactional | pricing, buy, demo, free trial, **migrate from A to B**, cancel | Proven willingness to pay; churn |
| Budget/complexity | cheap, affordable, **free**, lightweight, simple, self‑hosted | A bloated/expensive incumbent to undercut |
| **Pain / unmet** | **"is there a tool that…", "I wish there was…", "someone should build", "[tool] too expensive", "I hate [app]"** | Pre‑category demand — where new micro‑SaaS lives |
| Workaround | **spreadsheet**, manual, by hand, "how to automate [task]" | A manual workaround = an unbuilt tool |
| Vertical | "[software] for [profession]" | Underserved niches paying $30–$150/mo |
| Build‑shaped | API, integration, **template, calculator, generator, tracker, dashboard** | Directly productizable |

**A5. The free‑tool / programmatic‑SEO funnel** (Lukas's and the research's shared model): a free **calculator/generator/grader** ranks for a high‑intent "tool keyword," delivers instant value, then gates to paid (usage caps / faster result / report). Proven examples: Betterpic (AI headshots → $3.2M/18mo), Surfer's free Keyword Surfer (500k users), a single construction calculator (~600‑volume keyword → 6,000 visits + 120 leads/mo). For **pSEO at scale**, require **50+ modifier variations** with **10+ unique data points per page** (integrations → alternatives → comparisons → use‑case pages, in that build order).

### Lens B — Trends (catch demand before saturation)

**B1. Read Google Trends like a pro:** switch Related Queries to **Rising** (not Top); chase the **"Breakout"** label (>5,000% growth from near‑zero); use **Topics** over search terms; confirm a **sustained 6–12 month uptrend** (not a 2–4 week spike — "Google Trends should be called Google Fads"). Triangulate: a *real* trend shows up on **search + social + money** simultaneously.

**B2. Where on the curve?** Build at the **Slope of Enlightenment** (real demand, incumbents not yet entrenched), not the hype Peak. **Praise is a warning** — YC's "tarpit ideas" attract founders but few paying customers. The unifying test: **"Why now?"** — what capability/cost/regulation/platform *just* changed?

**B3. Platform & regulatory gold rushes (a new wedge appears overnight):**
- **AI platform shifts:** MCP servers (8M+ downloads, 5,800+ servers — build a single‑purpose MCP for a popular SaaS), the **ChatGPT Apps SDK** (newest, opened Dec 2025), **voice agents** (OpenAI Realtime API → Vapi/Retell layer).
- **App‑store economics:** Shopify devs now keep **100% of first $1M** → a single niche app is a real business; Notion lacks native backup/reporting; Figma/Canva plugin payouts.
- **Regulation = recurring‑revenue painkillers:** **EU Accessibility Act** (live June 2025 → audit/remediation tools — but real audits, *not* overlay widgets), **EU e‑invoicing/ViDA** (a country‑by‑country deadline patchwork = middleware business), **EU AI Act** high‑risk obligations (Aug 2026 deadline = GRC tooling spike), **US state privacy** (20 laws live in 2026).

**B4. Funding/launch signals:** mine **Product Hunt comments** ("I wish it did X", "integrates with Y?"), **YC's Request‑for‑Startups** (Summer 2026: AI‑native service companies, "company brain", software for agents), **Indie Hackers Milestones** (Stripe‑verified MRR), and "**X just raised $Y**" → build the integration/analytics/compliance **picks‑and‑shovels** layer they now need.

**B5. The defensibility reality (2025–2026):** thin "summarize any PDF" wrappers are dead; **vertical workflow tools win** (e.g. reads CRE leases → extracts 47 data points → integrates with Yardi). **Moat test — need ≥2 of 4:** proprietary data, embedded workflow, regulatory lock‑in, distribution.

### Lens C — Community & marketplace mining (where pain is in plain text)

**The universal tell across every channel:** someone writing **"is there a tool that…", "I wish there was…", "someone should build…", "how do I automate…", "I hate that [tool] can't…"** These are pre‑written feature requests. If every reply is a workaround (spreadsheet, Zapier duct‑tape), nobody's solved it → opportunity.

**C1. Reddit** — Google indexes it better than Reddit's own search. The workhorse query:
```
site:reddit.com ("is there a tool" OR "is there an app" OR "i wish there was" OR "someone should build") [niche]
site:reddit.com "alternative to" [incumbent] ("too expensive" OR "too complicated")
site:reddit.com [niche] ("spreadsheet" OR "manually") ("tedious" OR "wasting hours")
```
Add `after:2025-01-01`. Sort Top/Year. Gold subs: r/SaaS, r/smallbusiness, r/Entrepreneur **plus** higher‑value niche subs (r/sysadmin, r/accounting, r/realtors, r/bookkeeping, r/PPC). **A single complaint is noise; the same complaint across 10+ posts is a signal.**
⚠️ **GummySearch shut down Nov 30, 2025** (lost Reddit API license). Live alternatives: **Reddinbox** ($39/mo, research‑first), **SubredditSignals**, **F5Bot** (free alerts), **Syften** ($19/mo). Most "replacements" are lead‑gen, not research — Reddinbox/PainOnSocial are closest.

**C2. Review mining (1–3★ = pre‑validated demand).** Each negative review is a paying customer telling you what's missing.
- **G2:** sort **"Lowest Rated"**, read the forced "What do you dislike?" field; filter by *your* segment.
- **Capterra / Trustpilot:** filter 1–3★, read the **Cons** block; restrict to last 6 months.
- **Shopify App Store:** `apps.shopify.com/<app>/reviews?ratings[]=1` — merchant complaints are hyper‑specific.
- **Apple App Store (free, scriptable):** `https://itunes.apple.com/us/rss/customerreviews/id=<APP_ID>/sortby=mostrecent/json`, loop pages, filter rating ≤ 3.
- Read **3–4★** reviews especially — the "I love it but it's missing X" reviews map your wedge.
- Tools: Appbot ($49/mo), AppFollow, Outscraper ($3/1k), or just export → Claude.

**C3. Marketplace gap analysis** = **high demand (installs/reviews) + low satisfaction (<4.0★ vs. marketplace average) + stale (no recent update).**
- **Chrome Web Store** "abandoned but loved" pattern: **100k+ users + declining rating + no update in years + "please update" comments** (Manifest V2→V3 is killing un‑migrated incumbents). Real win: **Easy Folders** (ChatGPT lacked folders) → $3,700 MRR in 6 months.
- **HubSpot** (most data‑rich — public install counts): mine the **Ideas board** for upvoted "please integrate X" with no shipped app.
- **Zapier/Make integration gaps:** `zapier.com/apps/[A]/integrations/[B]` shows if two apps connect; thin/missing = a connector business (Whalesync raised $1.8M on exactly this).
- **WordPress:** query `api.wordpress.org/plugins/info/1.2/` for installs/rating/last_updated; high installs + low rating + old = "do it better."

**C4. Freelance/job marketplaces (a paid gig = proven WTP).** When people **repeatedly pay** freelancers for the *same rule‑based manual task*, that's your market.
- **Upwork** Boolean (CAPS AND/OR/NOT): `("data entry" OR "copy paste") ("spreadsheet" OR "CRM")`; filter payment‑verified, sort newest. Upwork's 2026 in‑demand list flags VA, **data entry**, transcription, data extraction, lead gen — all automatable.
- **Fiverr:** sort **Best Selling**, read "Orders in Queue" + review counts.
- **Job boards (LinkedIn/Indeed):** a "data entry specialist" or "manual reconciliation" posting *is* the demand signal (>70% of companies still reconcile bank txns manually).
- Pattern: background removal → remove.bg; invoice entry → Parseur; meeting notes → Otter.

**C5. Q&A & social:** Quora (`site:quora.com "is there a tool"` — few answers + high views = opportunity); **Stack Exchange Data Explorer** (free SQL: high‑view *unanswered* questions = tooling gaps — "how to write a cron expression" spawned crontab.guru); X "Latest" tab (`"I wish there was an app" min_faves:50`, weight bookmarks/replies over likes); Indie Hackers (MRR milestones = best WTP proof).

### Lens D — Copy, recombine & reposition (lowest‑risk)

Synthesizing Dennis + Kyle + Cravotta — the **deliberate cloning** lens:
1. **Find a proven product** (IndieHackers $3k–$50k MRR / Acquire.com listings / App Store top‑grossing / a SaaS you personally pay for).
2. **Apply one differentiation move:** niche‑down · light/cheaper version · go local/language · add security/compliance (GDPR/HIPAA) · combine 2–3 products · reverse‑engineer the tech · turn a service into a product.
3. **Win on positioning + distribution**, since the market is pre‑validated.

---

## Part 3 — The AI-assisted engine (the 2025–2026 edge)

What's genuinely new: **MCP servers wire live SEO/community data into Claude/Codex**, so the model reasons over *real* numbers instead of hallucinating them. **Rule: AI handles ideas/structure/clustering; metrics always come from a real tool.**

**SEO‑data MCPs:** **DataForSEO** (open‑source, cheapest pay‑per‑use), **Ahrefs MCP** (paid plans), **Semrush MCP** (Lukas's method), **Google Search Console MCP** (free, your own data).
**Community‑data MCPs:** **Apify** (`https://mcp.apify.com` — Reddit/review/marketplace scrapers), **Firecrawl**, **Bright Data SERP**, **reddit‑research‑mcp** (semantic search + citations).

**Reference end‑to‑end loop (run weekly):**
1. Seed a **high‑CPC vertical** (B2B SaaS, legal, finance, real estate — CPCs $10–$100+).
2. **Keyword‑gap** vs. 3–4 incumbents → export Missing/Untapped.
3. **AI‑cluster** the export (prompts below); **validate numbers** via DataForSEO/Ahrefs MCP.
4. **Filter:** KD < 20–30, volume ≥ 100, CPC > $5–10, commercial/pain intent.
5. **Read the SERP** for weakness; discard KD‑traps owned by big brands.
6. **Confirm the pain** in niche subreddits/reviews; **48‑hour landing‑page test**.
7. If it's a "[tool/calculator/generator] for [niche]" cluster with a weak SERP where the current answer is a spreadsheet or a Reddit thread → **build it**.

---

## Part 4 — Prompt & query library (copy‑paste)

**Keyword → product‑idea clustering (Claude/ChatGPT):**
```
I sell [product] to [buyer type]. Seed keyword: [keyword].
1) Generate 60 keyword ideas grouped by topic and search intent.
2) Cluster them into topics of 5–10 terms; for each, give the dominant intent and page type.
3) List the 20 questions a [buyer type] asks before buying [category].
Flag which clusters have commercial/transactional intent — those are candidate product wedges.
(Do NOT estimate search volumes — I'll pull those from a real tool.)
```

**Semrush/SEO MCP discovery (Lukas's prompt):**
```
Using Semrush, find me 20 keywords in [NICHE] with keyword difficulty under 20,
monthly search volume of at least 500, cost per click above $2, and volume that
grew over the last 12 months. Prioritize transactional or commercial intent.
Then for the top 5, pull related + LSI keywords plus question phrases so I can map
a content cluster.
```

**Reddit/community pain extraction (grounded — no invented quotes):**
```
You are a researcher extracting pain points from the feedback below.
1) Extract distinct frustrations. 2) Group into themes.
3) Quantify each by repetition. 4) Give VERBATIM quotes (max 5/theme) + the permalink.
5) Rank by impact = frequency × severity. 6) Suggest one product action per high-impact pain.
Never invent a quote; if grounding is insufficient, mark [Unverified].
[Paste threads/reviews, each with its source URL, separated by ---]
```

**Idea scoring (all four axes):**
```
Score each idea 1–10 on Frequency, Severity, Willingness-to-pay, Demand breadth,
showing the verbatim quote justifying each (mark N/A if absent).
WTP: already paying for a worse tool / "too expensive" = high; only free workarounds = low.
Output a markdown table sorted by Total = Frequency × Severity × WTP, with the
source permalink behind the highest-weighted axis.
```

**Reddit pain‑mining Google query:**
```
site:reddit.com ("is there a tool" OR "i wish there was" OR "someone should build" OR "how do I automate") [niche] after:2025-01-01
```

**Negative‑review mining:**
```
site:g2.com [tool] "what do you dislike"
site:capterra.com [tool] "cons" "wish"
site:trustpilot.com [tool] ("terrible" OR "refund" OR "avoid")
```

---

## Part 5 — Validation & scoring (before you write code)

### 5.1 Weighted scorecard (score 1–5 × weight; max 90)

| # | Criterion | "5" looks like | Weight |
|---|---|---|---|
| 1 | **Pain intensity** (painkiller vs vitamin) | urgent, recurring weekly/daily pain | 3 |
| 2 | **Willingness to pay** | already pays for a worse tool / freelancer / spreadsheet | 3 |
| 3 | **Demand evidence** | keyword clusters + active 1,000+ communities complaining | 2 |
| 4 | **Competition health** | 2–10 competitors with broken execution | 2 |
| 5 | **Solo‑build feasibility** | MVP shippable in ≤4 weeks | 2 |
| 6 | **Distribution/SEO** | a reachable channel (KD<30 keywords, a niche community, a list) | 3 |
| 7 | **Differentiation/edge** | you're in the market / have an audience / unique insight | 2 |
| 8 | **Stickiness** | embeds in a recurring workflow; data lock‑in | 1 |

**Verdict:** **≥70 build · 54–69 validate harder · <54 kill/pivot.**
**Hard vetoes (any one = bail):** pain = 1 (it's a vitamin) · distribution = 1 (the #1 silent killer) · **0–1 competitors** (usually "no demand," not "blue ocean").

### 5.2 Competition heuristic
**0–1 competitors = 🚩 risk** (no market / too much education) · **2–10 = ✅ healthy** · **10+ = only with clear differentiation.** A *weak incumbent worth attacking* = exists, customers pay, but reviews say "too expensive / too complex / missing X." A *graveyard* = 10+ undifferentiated free tools racing to the bottom, or the gap is distribution not product.

### 5.3 Pre‑build validation playbooks (set the pass bar *before* you see data)

| Tactic | Steps | Pass bar |
|---|---|---|
| **Landing page / fake door** | Carrd page, one ICP, one outcome, visible price, one CTA; drive 300–1,000 qualified sessions | email opt‑in **5–10% = strong; <2% = kill** |
| **Cold outreach (48h)** | mine pain in 3 subs + 2 FB groups; DM ~20 people who posted the pain | **10+ signups AND 3+ "I'd pay"** |
| **The Mom Test (10–20 interviews)** | ask about *past* behavior, not "would you use this"; you listen 80% | if you must *convince* them they have the problem → vitamin, kill |
| **Pre‑selling (strongest)** | ask for money before code: deposit, signed order, beta fee | **3+ strong OR 5+ medium paid commitments** (waitlist signups don't count) |
| **Concierge MVP** | deliver the outcome manually for first 1–5 paying customers | real $ + you learn the true workflow |

### 5.4 How much is "enough"? (honest distribution)
Median micro‑SaaS ≈ **$500/mo**; **~70% never break $1k MRR**; median *profitable* one ≈ **$4.2k MRR**; ~10% break $20k+. Targets: **$1k MRR** = validation milestone, **$5k–$50k MRR** = the sweet spot, **$10k MRR** = replace‑a‑salary. Back into it: `target MRR ÷ price = customers`. At $79/mo, $10k MRR = ~127 customers — then sanity‑check your *one* channel can plausibly reach them. Comps: Indie Hackers milestones, **TrustMRR** (Stripe‑verified), **Acquire.com** listings (bootstrapped SaaS sells ~3–5× ARR).

### 5.5 Pricing fit
**$9–$29/mo** entry sweet spot; **2–3 tiers max**; add **annual** only after stability (cuts churn ~30%). "**$19/mo is a vitamin; $79/mo is a painkiller**" — acute pain commands premium pricing, and ~100 customers at painkiller pricing = ramen profitable. 2025–26 shift: usage‑based/hybrid pricing is overtaking pure per‑seat for AI products.

### 5.6 Why ideas fail validation (the pre‑flight filters)
Vitamin not painkiller · false‑positive signups (require *paid* pre‑sales) · **no distribution channel** (CAC > LTV) · "no competition" mistaken for opportunity · leading‑question interviews · feature‑not‑a‑product (incumbent copies you) · one‑time (non‑recurring) problem. Root cause of most failures: **assumed too much about customer pain, tested too little.**

---

## Part 6 — A concrete 7‑day plan

- **Day 1 — Pick a hunting ground.** Choose an evergreen market (Health/Wealth/Relationships/B2B ops) where you have an edge, *or* a vertical you understand. List the SaaS you personally pay for.
- **Day 2 — Search/SEO sweep.** Run keyword‑gap vs. 3–4 incumbents; collect "[tool] for [niche]", "alternative", "template/calculator" keywords with KD<30 + CPC>$5. Read 10 SERPs for weakness. (Lens A.)
- **Day 3 — Community + review mining.** Run the Reddit `site:` query + 1–3★ review mining on 3 incumbents + Zapier integration‑gap probing. Cluster complaints with the extraction prompt. (Lens C.)
- **Day 4 — Trend + platform check.** Google Trends (rising/breakout, 12‑mo durability) + scan one platform/regulatory wave for a fresh wedge. (Lens B.)
- **Day 5 — Shortlist & score.** Put 5–10 candidates through the weighted scorecard + competition heuristic. Keep the top 2–3 (≥70, no vetoes).
- **Day 6 — Validate demand.** Stand up a fake‑door landing page (price visible) + DM 20 people who posted the pain. Aim 5–10% opt‑in / 3+ "I'd pay."
- **Day 7 — Pre‑sell the winner.** Ask for real money (deposit/beta fee). **3+ strong commitments = build the ≤4‑week MVP. Otherwise pivot — don't move the goalposts.**

---

## Appendix — Tooling cheat‑sheet (mid‑2026)

| Job | Free / cheap | Paid power |
|---|---|---|
| **Keyword/SEO data** | Google Keyword Planner, Search Console, Ahrefs free Keyword Generator, **Keywords Everywhere** (~$7/mo) | Ahrefs ($29 Starter), Semrush ($139), **LowFruits** (weak‑SERP, $25 PAYG), Mangools (~$20/mo) |
| **Trends** | **Google Trends** (free), Glimpse (free tier) | Exploding Topics ($39+/mo), Trends.vc (~$299/yr), Treendly |
| **Reddit/community** | **F5Bot** (free), Google `site:reddit.com`, Stack Exchange Data Explorer (free) | Reddinbox ($39/mo), Syften ($19/mo), SubredditSignals |
| **Reviews** | Apple RSS JSON feed (free), Outscraper ($3/1k) | Appbot ($49/mo), AppFollow |
| **Marketplace/app data** | wordpress.org plugin API, Zapier/Make URL probing, chrome‑stats free tier | Sensor Tower, Store Leads ($75/mo), GapQuery, BuiltWith |
| **App/SaaS marketplaces** | Acquire.com, Flippa, IndieHackers, Product Hunt | — |
| **Validated‑business data** | IndieHackers Milestones, TrustMRR (free), Crunchbase free | Crunchbase Pro (~$99/mo) |
| **AI idea engine** | Claude / ChatGPT + **DataForSEO MCP** / **GSC MCP** / **Apify MCP** (pay‑per‑use) | Semrush MCP, Ahrefs MCP |
| **Build/validate** | Carrd/Tally landing pages, Lovable, Stripe | v0/Vercel, Webflow + Airtable + Whalesync (pSEO) |

### Source videos
1. Dennis Babych — *How to Find 59 Micro SaaS Ideas in 1 Week* (youtu.be/3hWQRslkqss)
2. Starter Story — *How to Use AI to Find a $1M Idea [Reddit, Claude]* (youtu.be/L_FY6aW9cJ4)
3. Steven Cravotta — *How I Find App Ideas That Print ($90k/month Micro SaaS)* (youtu.be/z_fARFqjLoY)
4. Kyle Gawley — *STOP looking for SaaS Ideas (do this instead)* (youtu.be/kMAa4HUjK6Y)
5. Lukas Margerie — *Turn Claude Code into a SaaS Idea Engine with This Semrush MCP* (youtu.be/S3K3l0YWOW8)

*Web‑research citations (SEO, trends, community, validation) are embedded inline throughout Parts 2–5.*
