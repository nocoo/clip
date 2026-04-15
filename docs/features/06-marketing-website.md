# 06 — Marketing Website

## 1. Overview

The marketing and documentation website for clip lives in `packages/web/`. It is a static site built with Astro, designed to explain what clip does, show how to use it, and provide reference documentation for the schema format and CLI commands.

## 2. Package Structure

```
packages/web/
├── src/
│   ├── pages/
│   │   ├── index.astro           # Landing page
│   │   ├── about.astro           # About page
│   │   └── docs/
│   │       ├── index.astro       # Docs landing — Getting Started
│   │       ├── schema.astro      # Schema reference
│   │       └── cli.astro         # CLI command reference
│   ├── layouts/
│   │   ├── BaseLayout.astro      # HTML shell, meta tags, fonts
│   │   └── DocsLayout.astro      # Docs layout with sidebar navigation
│   ├── components/
│   │   ├── Header.astro          # Site header with navigation
│   │   ├── Footer.astro          # Site footer
│   │   ├── Hero.astro            # Landing page hero section
│   │   ├── Features.astro        # Feature grid section
│   │   ├── HowItWorks.astro      # Step-by-step section
│   │   ├── CodeBlock.astro       # Syntax-highlighted code block
│   │   └── DocsSidebar.astro     # Documentation sidebar nav
│   └── styles/
│       └── global.css            # Global styles, CSS variables, dark mode
├── public/
│   ├── favicon.svg
│   └── og-image.png
├── astro.config.mjs
├── package.json
└── tsconfig.json
```

## 3. Pages

### Landing Page (`/`)

The main marketing page with four sections:

**Hero Section**:
- Headline: "Turn your API schema into a CLI in seconds"
- Subheadline: "Define your API in YAML. clip generates a fully working CLI tool and test suite."
- CTA button: "Get Started" → links to `/docs/`
- Terminal animation showing the clip workflow:
  ```
  $ clip generate
  ✓ Parsed clip.yaml (5 endpoints)
  ✓ Generated CLI "todo" in .clip-output/todo/

  $ clip install
  ✓ Installed "todo" command globally

  $ todo list
  [{"id": "1", "title": "Buy milk", "completed": false}]
  ```

**Features Section**:
A 3-column grid:
1. **Schema-First** — Define your API once in YAML, generate everything
2. **Auto-Generated Tests** — Every endpoint gets a test that validates response shape
3. **Zero Config Auth** — Credentials stored securely, injected automatically

**How It Works Section**:
Numbered steps with code examples:
1. **Define** — Write a `clip.yaml` file (show example snippet)
2. **Generate** — Run `clip generate` to create the CLI
3. **Use** — Run commands like `todo create --title "Buy milk"`

**Footer**:
- Links: GitHub, Docs, About
- Copyright notice

### Docs — Getting Started (`/docs/`)

Step-by-step guide:

1. **Install clip** — `bun install -g @clip/cli`
2. **Create a schema** — example `clip.yaml` with explanation
3. **Generate your CLI** — `clip generate`
4. **Set up auth** — `clip auth set <alias>`
5. **Install globally** — `clip install`
6. **Run tests** — `clip test <alias>`

### Docs — Schema Reference (`/docs/schema`)

Complete reference for the `clip.yaml` format:
- All top-level fields with types and descriptions
- `auth` configuration
- `endpoints` array structure
- `params` (path, query, body)
- `response` schema definition
- Full annotated example

### Docs — CLI Reference (`/docs/cli`)

Reference for all clip commands:

| Command | Description |
|---------|-------------|
| `clip generate` | Generate CLI from clip.yaml |
| `clip install` | Generate + install CLI globally |
| `clip test <alias>` | Run generated tests |
| `clip auth set <alias>` | Set API credentials |
| `clip auth show <alias>` | Show stored credentials |
| `clip auth remove <alias>` | Remove stored credentials |

Each command includes:
- Synopsis (usage string)
- Options/flags
- Example usage

### About Page (`/about`)

- What is clip and why it exists
- Technology stack
- Link to GitHub repository

## 4. Design System

### Theme: Dark Mode Default

```css
/* packages/web/src/styles/global.css */

:root {
  /* Colors — Dark theme */
  --color-bg: #0a0a0b;
  --color-bg-secondary: #141416;
  --color-bg-elevated: #1c1c1f;
  --color-text: #e4e4e7;
  --color-text-secondary: #a1a1aa;
  --color-accent: #6366f1;       /* Indigo-500 */
  --color-accent-hover: #818cf8; /* Indigo-400 */
  --color-border: #27272a;
  --color-code-bg: #18181b;

  /* Typography */
  --font-sans: "Inter", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", "Fira Code", monospace;

  /* Spacing */
  --space-xs: 0.25rem;
  --space-sm: 0.5rem;
  --space-md: 1rem;
  --space-lg: 2rem;
  --space-xl: 4rem;

  /* Layout */
  --max-width: 1200px;
  --docs-sidebar-width: 260px;
}
```

### Typography

- Headings: Inter, bold, tracking tight
- Body: Inter, regular, 1.6 line height
- Code: JetBrains Mono, with syntax highlighting via Shiki (built into Astro)

### Component Patterns

All components are Astro components (`.astro` files) — zero client-side JavaScript by default. If interactive behavior is needed (e.g., mobile nav toggle), use `<script>` tags with vanilla JS.

## 5. Astro Configuration

### `astro.config.mjs`

```javascript
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://clip.dev",  // Placeholder
  output: "static",
  markdown: {
    shikiConfig: {
      theme: "github-dark",
    },
  },
});
```

### `package.json`

```jsonc
{
  "name": "@clip/web",
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview"
  },
  "dependencies": {
    "astro": "^5.x"
  }
}
```

## 6. Content Strategy

| Page | Primary Goal | Key Content |
|------|-------------|-------------|
| Landing | Convert visitors → users | Hero, features, workflow demo |
| Getting Started | Onboard new users | Step-by-step tutorial |
| Schema Reference | Reference lookup | Complete field documentation |
| CLI Reference | Reference lookup | All commands with examples |
| About | Build trust | Mission, tech stack, team |

### Docs Content Source-of-Truth

For MVP, all documentation content is **authored directly in Astro/MDX pages** within `packages/web/src/pages/docs/`. Content is not derived from files in the repo `docs/` directory.

> **Future consideration:** If docs pages drift from the design documents in `docs/`, a build step could generate pages from `docs/` Markdown files. For now, direct authoring in MDX is simpler and avoids the complexity of a content pipeline.

## 7. SEO and Meta

Each page includes:
- `<title>` tag with page-specific title
- `<meta name="description">` with page summary
- Open Graph tags for social sharing
- Canonical URL

### BaseLayout Meta

```html
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{title} — clip</title>
  <meta name="description" content={description} />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:image" content="/og-image.png" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
</head>
```

## 8. Files to Create/Modify

| File Path | Action | Purpose |
|-----------|--------|---------|
| `packages/web/astro.config.mjs` | Create | Astro configuration |
| `packages/web/package.json` | Create | Package manifest |
| `packages/web/tsconfig.json` | Create | TypeScript config |
| `packages/web/src/styles/global.css` | Create | Global styles + design tokens |
| `packages/web/src/layouts/BaseLayout.astro` | Create | HTML shell layout |
| `packages/web/src/layouts/DocsLayout.astro` | Create | Docs layout with sidebar |
| `packages/web/src/components/Header.astro` | Create | Site header |
| `packages/web/src/components/Footer.astro` | Create | Site footer |
| `packages/web/src/components/Hero.astro` | Create | Landing hero section |
| `packages/web/src/components/Features.astro` | Create | Feature grid |
| `packages/web/src/components/HowItWorks.astro` | Create | Step-by-step section |
| `packages/web/src/components/CodeBlock.astro` | Create | Code display component |
| `packages/web/src/components/DocsSidebar.astro` | Create | Docs sidebar nav |
| `packages/web/src/pages/index.astro` | Create | Landing page |
| `packages/web/src/pages/about.astro` | Create | About page |
| `packages/web/src/pages/docs/index.astro` | Create | Getting Started |
| `packages/web/src/pages/docs/schema.astro` | Create | Schema reference |
| `packages/web/src/pages/docs/cli.astro` | Create | CLI reference |
| `packages/web/public/favicon.svg` | Create | Favicon |
| `packages/web/public/og-image.png` | Create | Open Graph social sharing image |
| `packages/web/tests/build.test.ts` | Create | Build verification test |

## 9. Test Strategy

### Unit Tests

The marketing site is a static site with no business logic — unit tests are minimal:

**`build.test.ts`**:
- ✅ `astro build` completes without errors
- ✅ All pages render to HTML
- ✅ No broken internal links

### G1 Checks

- Biome linting on all `.astro`, `.ts`, `.css` files
- TypeScript strict mode

### Atomic Commit Plan

1. `chore(web): scaffold Astro project with config and package.json`
2. `feat(web): add global styles and design tokens (dark theme)`
3. `feat(web): implement BaseLayout and DocsLayout`
4. `feat(web): implement Header and Footer components`
5. `feat(web): implement landing page (Hero, Features, HowItWorks)`
6. `feat(web): implement docs pages (Getting Started, Schema Reference, CLI Reference)`
7. `feat(web): implement About page`
8. `feat(web): add favicon and OG image`
9. `test(web): add build verification test`
