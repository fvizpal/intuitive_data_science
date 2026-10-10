# Intuitive Data Science — Project Brief

Oct 8, 2026 · @Vishal

## Project overview

A free, static website that teaches data science concepts through interactive visualizations on mock data, with as few words as possible. A reader moves a slider and immediately sees what the concept does: for example, a high learning rate making gradient descent bounce across the valley and diverge.

**Audience:** everyone, weighted toward working practitioners. Beginners should get the intuition; practitioners should get the "how it behaves in real work" layer.

**Edge:** a lending lens. Every concept gets a short real-world note from credit risk, and there is a dedicated track for credit-risk concepts (KS, Gini, WoE/IV, PSI, calibration, cost-based thresholds) that few explorable sites cover.

**Prior art to learn from (not copy):**

- MLU-Explain (Amazon): scroll-driven ML explainers, closest in spirit
- Seeing Theory (Brown University): probability and statistics
- Distill.pub and R2D3: high-quality interactive articles
- TensorFlow Playground: one focused tool done very well

## Principles and non-goals

Every decision should keep the site instant to load, free of friction, and visual first.

**Principles**

1. **Show, then tell.** The visualization comes first; text explains what the reader just saw. Most paragraphs are 1–3 sentences.
2. **One knob first.** Each widget opens with a single control. More controls unlock further down the page.
3. **Predict before play.** Ask the reader to guess the outcome before revealing it.
4. **Instant feedback.** Every control change redraws in under one frame (16 ms) for typical sizes.
5. **Snappy by default.** Text pages ship zero JavaScript; only widgets load code, and only when visible.
6. **Reproducible mock data.** Seeded random data so everyone sees the same picture, with a "reshuffle" button.
7. **Works on a phone.** Every widget is usable at 375 px wide with touch.

**Non-goals**

- No logins, accounts, or user database. Progress lives in `localStorage`.
- No backend or API server. The whole site is static files.
- No downloads, installs, or notebooks to run.
- No Python in the browser by default (Pyodide is about 10 MB). Heavy computation is precomputed at build time into small JSON files.
- No ads, cookie banners, or tracking beyond privacy-friendly page counts.

## Tech stack

Astro with React islands, deployed as a static site to Cloudflare Pages. The owner already knows React and Next.js; Astro is chosen over Next.js because content pages ship no JavaScript by default.

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | Astro (static output) | Zero JS for text; interactive parts load as islands |
| Widgets | React + TypeScript | Owner's existing skill; hydrate with `client:visible` |
| Content | MDX via `@astrojs/mdx` | Prose with `<LearningRateDemo />` dropped inline |
| Charts and scales | `d3-scale`, `d3-shape`, `d3-array` (modular imports only) | Math helpers without pulling in all of D3 |
| Rendering | SVG for simple charts; Canvas for animation or more than \~1,000 points | SVG is easy to style; Canvas stays smooth |
| Math | KaTeX via `remark-math` + `rehype-katex` | Formulas render at build time |
| Styling | Tailwind CSS + CSS variables for theme tokens | Fast to write; dark mode via tokens |
| Mock data | Seeded PRNG in TypeScript (e.g. mulberry32) | Same data for every reader |
| Heavy compute | Python scripts at build time → JSON in `public/data/` | Keeps the browser light |
| Hosting | Cloudflare Pages (Vercel as fallback) | Free, global CDN, deploy on push |
| Analytics | Umami or Plausible | No cookies, no banner |
| Quality | ESLint, Prettier, Vitest for math utils, Lighthouse CI | Keeps performance from regressing |

**Later, only if needed:** Three.js (via `@react-three/fiber`) for 3D loss surfaces; Framer Motion for complex transitions. Add them per widget, never globally.

## Repo structure and conventions

One concept = one MDX file plus a folder of widgets. Shared math and UI live in `lib/` and `components/ui/`.

```text
/
├─ src/
│  ├─ content/concepts/          # one .mdx per concept, with frontmatter
│  │   └─ learning-rate.mdx
│  ├─ widgets/                   # React islands, one folder per concept
│  │   └─ learning-rate/
│  │       ├─ LearningRateDemo.tsx
│  │       ├─ gd.ts              # pure math, unit-tested
│  │       └─ gd.test.ts
│  ├─ components/
│  │   ├─ layout/                # ConceptLayout.astro, header, footer
│  │   └─ ui/                    # Slider, Toggle, PredictPrompt, Reveal, Callout
│  ├─ lib/
│  │   ├─ random.ts              # seeded PRNG + distributions
│  │   ├─ datasets.ts            # mock data generators
│  │   └─ theme.ts               # reads CSS color tokens for Canvas
│  ├─ pages/                     # index.astro, concepts/[slug].astro
│  └─ styles/global.css          # tokens, light + dark
├─ scripts/precompute/           # Python → public/data/*.json
├─ public/data/
├─ CLAUDE.md                     # this brief, condensed
└─ astro.config.mjs
```

**Concept frontmatter**

```yaml
title: Learning rate
slug: learning-rate
track: optimization        # optimization | models | evaluation | statistics | credit-risk
level: beginner            # beginner | intermediate | advanced
minutes: 4
prerequisites: [gradient-descent]
summary: How step size decides whether you converge, crawl, or blow up.
```

**Conventions**

- Math lives in pure `.ts` files with no React, so it can be unit-tested and reused.
- Widgets take a `seed` prop and never call `Math.random()` directly.
- Colors come from CSS variables, never hard-coded hex.
- Every widget is hydrated with `client:visible`.
- Each widget's JS bundle stays under 50 KB gzipped (check with `astro build` output).

## Concept page template

Every concept page has the same three layers, so readers learn the site once and stop at the depth they need.

**Layer 1 — Intuition (everyone, always visible)**

1. **Hook:** one line, phrased as the question a practitioner actually asks ("Why does my loss explode?").
2. **Predict:** a `PredictPrompt` with 2–4 choices. The answer reveals only after a pick.
3. **Play:** the main widget, one knob first, with 2–3 "try this" suggestions under it.
4. **What just happened:** 2–3 sentences tying the motion on screen to the idea.

**Layer 2 — The math (collapsed by default)**

5. The key formula in KaTeX, with each symbol mapped to something the reader saw move. For example, the update rule:

```latex
\theta_{t+1} = \theta_t - \eta \, \nabla L(\theta_t)
```

**Layer 3 — In practice (practitioners)**

6. **Common misconception:** one short callout.
7. **In the wild — lending:** where this shows up in credit risk work (e.g. XGBoost `eta` vs `n_estimators`, a 2–5% default rate, validating on a newer vintage).
8. **Rules of thumb:** 2–4 bullets of what people actually do.
9. **Next concepts:** links to related pages.

The `ConceptLayout.astro` component should render the shell (title, level, minutes, progress tick, prev/next), and MDX supplies the content for each layer through components: `<Hook>`, `<PredictPrompt>`, `<Explain>`, `<MathDetails>`, `<Misconception>`, `<InTheWild>`, `<RulesOfThumb>`.

## Widget engineering guidelines

Widgets are where performance is won or lost, so they follow the same rules.

**Performance**

- Separate state from drawing: React holds control values; drawing happens in a `useEffect` or a `requestAnimationFrame` loop on a Canvas ref, not by re-rendering hundreds of SVG nodes.
- Animations run on `requestAnimationFrame` and pause when the widget scrolls off screen (`IntersectionObserver`) or the tab is hidden.
- Memoize datasets with `useMemo` keyed on the seed and size.
- Scale Canvas by `devicePixelRatio` so lines stay sharp on phones.
- Target: Lighthouse performance ≥ 95 on a concept page; largest contentful paint under 1.5 s on 4G.

**Interaction**

- Controls: `Slider`, `Toggle`, `SegmentedControl`, `Button` from `components/ui/`. Each shows its current value.
- Every widget has "Reset" and "Reshuffle data" buttons.
- Pointer events cover mouse and touch; draggable points have a hit area of at least 24 px.
- Learning rate and other scale-like values use a log slider.

**Accessibility**

- Sliders are real `<input type="range">` with labels, so they work with keyboard and screen readers.
- Each widget has an `aria-label` and a short text summary of what it currently shows (e.g. "Diverged after 6 steps").
- Never rely on color alone; pair color with shape, dash, or label.
- Respect `prefers-reduced-motion`: show the final state instead of animating.

**Theming**

- Colors are CSS variables (`--color-ink`, `--color-muted`, `--color-accent`, `--color-good`, `--color-bad`, `--color-grid`) defined for light and dark.
- Canvas reads them through `lib/theme.ts` and redraws on theme change.
- One accent color per widget for the thing that matters; everything else is muted.

## Concept roadmap

Three MVP concepts first, then one new concept every 2–3 weeks. The credit-risk track is the long-term differentiator.

| Concept | Track | Phase | Core visual | Lending note |
| --- | --- | --- | --- | --- |
| Learning rate | optimization | MVP | Ball stepping down a loss curve; bounce and divergence | XGBoost `eta` vs number of trees |
| Bias–variance / overfitting | models | MVP | Drag polynomial degree; train vs test error curves | Model fits old vintages, fails on new ones |
| Threshold, precision and recall | evaluation | MVP | Slide a cutoff over two score distributions; confusion matrix updates | Approval cutoff vs expected losses |
| Momentum and Adam vs SGD | optimization | Next | Three optimizers racing on a ravine-shaped contour | — |
| Feature scaling | optimization | Next | Elongated vs round contours; steps zig-zag or go straight | Loan amount vs ratio features |
| L1 / L2 regularization | models | Next | Coefficient paths as lambda grows; L1 hitting zero | Pruning bureau variables |
| ROC and AUC | evaluation | Next | ROC curve built point by point as threshold moves | Gini = 2 × AUC − 1 |
| Decision tree splits | models | Next | Click to split a 2D dataset; impurity drops | Rule-based policy vs model |
| k-means | models | Next | Step through assign / update iterations | Customer segments |
| Cross-validation | evaluation | Next | Folds sliding across the data | Out-of-time validation |
| Sampling and the central limit theorem | statistics | Planned | Sample means from skewed data forming a bell | Portfolio averages |
| Averages and spread (mean, median, mode, SD, quartiles) | statistics | **Done** | Dots on a number line; one outlier dragging the mean; two groups with the same mean and different spread | Median ticket size, weighted interest rate, spread by segment |
| Correlation (Pearson and Spearman) | statistics | **Done** | Values vs ranks; one outlier faking r; twin features splitting betas | Spearman for skewed bureau and income variables; dedupe before scorecards |
| Distributions and the bell curve | statistics | **Done** | Bin-width histogram; bell curve with draggable range; 68-95-99.7 bands; z-scores on one axis; log squashing a long tail | Bin edges drive WoE; standardizing features; skewed turnover vs bell-shaped bureau score |
| KS, AUC and Gini | credit-risk | **Done** | Two crowds; cumulative curves with the max gap (KS); random-pair AUC; ROC area to Gini; sample wobble on the real scorecard | Scorecard acceptance metrics; ranking is not calibration; bands are conventions |
| WoE and IV | credit-risk | **Done** | Drag bin edges; WoE bars and IV update; noise feature gaining IV with more bins | Scorecard binning; leakage shows up as IV above 0.5 |
| From WoE to a scorecard | credit-risk | **Done** | Evidence waterfall, fitted weights, odds-to-points ladder, applicant scorecard with reason codes, cutoff on score histograms | PD scorecard build; reason codes for declines; cutoff trade-off |
| PSI and drift | credit-risk | Planned | Shift the population; PSI gauge moves | Monitoring after launch |
| Calibration | credit-risk | Lending track | Reliability curve; apply Platt / isotonic | PD used for pricing |
| Class imbalance | credit-risk | Lending track | Accuracy vs recall at a 3% default rate; class weights vs SMOTE | Rare defaults |
| Cost-sensitive threshold | credit-risk | Lending track | Profit curve from a cost matrix | Loss on default vs margin |

