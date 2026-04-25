---
read_when:
  - Importing a Figma page or frame before implementing UI
  - Comparing coded UI against Figma renders
---

# Figma Pull

Use the repo CLI to pull Figma design data and rendered reference images before coding UI.

```bash
doppler run --project api_keys --config dev -- npm run figma:pull -- "https://www.figma.com/design/FILE_KEY/File?node-id=1-2"
```

Outputs are written under `.figma/<file-key>/<file-and-node-name>/`:

- `manifest.json`: source metadata, exported node IDs, render paths
- `nodes.json`: raw selected Figma nodes
- `implementation-summary.json`: compact geometry, fills, strokes, typography, effects
- `renders/*.png`: rendered frame/page references for screenshot diffing

For a page URL, the CLI exports the page's top-level frames. For a frame URL, it exports that frame.

Useful options:

```bash
npm run figma:pull -- <url> --ids 12:34,56:78
npm run figma:pull -- <url> --image-fills
npm run figma:pull -- <url> --format svg
```

Implementation flow:

1. Pull the target frame/page.
2. Build the UI from `implementation-summary.json` and rendered references.
3. Run the app locally.
4. Capture browser screenshots at the same viewport size as the Figma frame.
5. Compare against `.figma/.../renders/*.png` and iterate until spacing, typography, color, and assets match.
