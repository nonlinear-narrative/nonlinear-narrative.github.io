# Project page: Can LLMs Tell Stories Out of Order?

A static project page for the arXiv preprint *Can LLMs Tell Stories Out of
Order? A Corpus and Benchmark for Nonlinear Narrative Generation*. Plain HTML, CSS
and JavaScript modules: no build step, no framework, no CDN, no analytics. Fonts are
served with the page and nothing loads from another origin.

## Preview locally

```sh
make serve          # or: python3 -m http.server 8000
```

Then open <http://localhost:8000>. The page must be served over HTTP: browsers block
JavaScript modules and JSON loaded from `file://`. Opened from a file, the text and
tables still read correctly, and a notice explains how to start the server.

The narrative-order plots advance one event every 450 ms. Shape examples hold
their completed curve for 1.4 seconds before repeating; the overview plays all
three scenes and loops. Use the shape browser's Pause/Play button or the overview's
existing playback controls to stop or resume motion. Playback pauses when the plot
is off-screen or the browser tab is hidden. Reduced-motion preferences show the
complete static diagrams by default. Choose Play animation to enable motion for
the current page visit; this does not change the system setting. Changing that
setting while browsing restores the system preference, and reloading clears the
page's motion opt-in.

## What is where

| Path | Contents |
|---|---|
| `index.html` | Every section's text and tables, readable without JavaScript |
| `assets/data/paper.json` | Numbers from the paper's tables and figures; each block names its source |
| `assets/data/hero.json` | Figure 2 telling order, roles and card text; Figure 1's three orders |
| `assets/js/metrics.js` | τ, LIS, hops, band hit (the formulas of the formal appendix) |
| `assets/js/hero/` | The overview animation: engine (`timeline.js`), three scenes (Figure 1's three tellings, then Figure 2's reveal and its scores), pixel pictograms |
| `assets/js/charts.js` | Redrawn charts (bars, dumbbells, heatmap, split bars, dot plot, κ plot) |
| `assets/js/page.js` | Theme, section highlight, shape browser, sortable leaderboard, BibTeX copy |
| `assets/js/motion.js` | System motion preference and the page's explicit Play opt-in |
| `assets/css/` | `tokens.css` (themes, fonts, frames), `page.css`, `hero.css` |
| `tools/` | Checks (below) |

## Checks

```sh
make check          # data and printed numbers against the paper's stated values
make anonymity ANON_DENY="name one,name two"   # keep the list out of this folder
make verify         # browser checks; needs Playwright (npm i -D playwright)
```

- `tools/check-data.mjs` verifies that each hero order is a permutation that
  reproduces its caption (Figure 2: τ = −0.085, LIS = 0.50, 13 hops; Figure 1: +0.97,
  −1.00, −0.88), that the cards sit at told 01/03/16/18 with +1, +12, +1 between, that
  the shape curves reproduce Figure 4's τ, that table splits give their rates, and that
  every number printed in `index.html` with a `data-k` attribute matches `paper.json`.
- `tools/verify.mjs` loads the page at 360, 768 and 1280 px, in day and night, with and
  without reduced motion. It fails on sideways scrolling, console errors, empty charts
  or any request to another origin, tests narrative playback and the hero's keyboard controls, and writes
  screenshots of every scene to `.preview/`. Set `CHROME=/path/to/chromium` to use a
  browser that is already installed.

## Editing numbers

Change `assets/data/paper.json` and the matching `data-k` cell in `index.html`, then run
`make check`. A mismatch between the two fails the check. The Table 1 pooled row is the
mean over valid outputs, not over model rows, so `paper.json` also stores each model's
valid-output count.

## Before publishing

- **Paper button.** It links to the [arXiv paper](http://arxiv.org/abs/2610.21468).
- **Hosting.** A site under a personal GitHub account names the authors. Publish from an
  account not tied to them, or after review. Run `make anonymity` with the authors'
  names first.
- `robots` is set to `noindex` in `index.html`; remove it after review if the page
  should be indexed.

## Licenses

Pixel Operator Mono is CC0 and needs no credit. IBM Plex Mono is under the SIL Open
Font License 1.1, which requires its copyright notice and license to accompany the font
files, not to be shown on the page; both are in `assets/licenses/` and in the fonts'
own metadata. Keep those files when deploying. All pixel art is original.
