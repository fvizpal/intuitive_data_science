# Intuitive Data Science

A free, static website that teaches data science concepts through interactive visualizations on mock data, with as few words as possible.

## Tech stack

Astro (static output) with React islands, MDX for content, Tailwind CSS with CSS-variable theme tokens, and modular `d3-scale` / `d3-shape` / `d3-array` for chart math. Formulas render with KaTeX at build time. Tests use Vitest.

## Getting started

Requires Node 22.12 or newer.

```bash
npm install
npm run dev
```

## Codebase structure

One concept is one MDX file plus a folder of widgets.

```text
.
├─ src/
│  ├─ content/concepts/     # one .mdx per concept, with frontmatter
│  ├─ widgets/              # React islands, one folder per concept
│  ├─ components/
│  │  ├─ layout/            # ConceptLayout.astro (page shell)
│  │  ├─ mdx/               # Hook, Explain, Misconception, InTheWild, RulesOfThumb
│  │  └─ ui/                # Slider, Toggle, Button, PredictPrompt, MathDetails, ...
│  ├─ lib/                  # seeded PRNG, mock datasets, theme and canvas helpers
│  ├─ pages/                # index.astro, concepts/[slug]
│  ├─ styles/global.css     # theme tokens, light + dark
│  └─ content.config.ts     # concept frontmatter schema
├─ scripts/precompute/      # Python scripts that write JSON for the browser
├─ public/data/             # precomputed JSON served as-is
└─ .github/workflows/       # CI
```

## How a concept page is built

Each page has three layers:

1. **Intuition:** a hook question, a predict prompt, the main widget, and a short "what just happened".
2. **The math:** the key formula in KaTeX, collapsed by default.
3. **In practice:** a common misconception, an example, rules of thumb, and links to related concepts.

Frontmatter looks like this:

```yaml
title: Learning rate
slug: learning-rate
track: optimization   # optimization | models | evaluation | statistics | credit-risk
level: beginner       # beginner | intermediate | advanced
minutes: 4
prerequisites: [gradient-descent]
summary: How step size decides whether you converge, crawl, or blow up.
```

## Contributing

1. Fork the repo and create a branch.
2. Run `npm install` and `npm run dev`.
3. Make your change.
4. Open a PR.

Bug reports, typo fixes, and new concept proposals are welcome. For a new concept, open an issue first .

### Adding a concept

1. Add `src/content/concepts/<slug>.mdx` with the frontmatter above.
2. Add widgets in `src/widgets/<slug>/`.
3. Put pure math in its own `.ts` file with a `.test.ts` next to it.
4. Follow the three-layer template.
5. Hydrate widgets with `client:visible`.

## License

[MIT](LICENSE)
