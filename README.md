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
complete static diagrams by default. Choose Play animation below the diagram in
“One story, two orders” to enable motion for the current page visit; this does not
change the system setting. Shape Pause/Play controls appear once motion is enabled.
Changing that setting while browsing restores the system preference, and reloading
clears the page's motion opt-in.

The pause button in the header holds every animation on the page (the overview, the
shape curves and the cameos), and the page remembers the hold on later visits; press
it again, or Play animation, to resume. Switching between day and night dissolves the
new palette in through a pixel dither; with motion held or reduced, the switch is
instant. A bar along the header's title strip fills as you read, and the benchmark
grid keeps its column headings (and, when it scrolls sideways, the model names) in view.

The title band, the epigraph and the closing shot hold pixel-art cameos from films
told out of order, each drawn on a canvas by `assets/js/eggs/`:

- The heptapod logogram for “Time” (*Arrival*) behind the title is written in one
  sweep, drifts like ink in water and dissolves, then is written again about every
  45 seconds.
- Gargantua and the *Endurance* (*Interstellar*) are traced from a still of the film
  and keep its proportions. The disk's filaments flow smoothly along their own streaks, and the
  *Endurance*, redrawn in 3D where the still has it, turns slowly with its engines
  pulsing.
- The logogram for “There is no linear time” above the closing epigraph is written by
  the reader's scroll, and scrolling back unwrites it.
- The shell over its Montana valley, shaped after the film's poster, hangs above
  drifting fog while clouds stream down a long slope and a Chinook flies in toward it;
  lights by the camp sparkle on the valley floor.

The cameos follow the plots' rules: they move only on screen in a visible tab, show a
still frame under reduced motion, and move after Play animation. Without scripts, or
opened from a file, the page shows the still frames in `assets/img/egg-*.png`.
Both title scenes sit behind the heading with soft radial fades into the page's
background; a wash behind the heading keeps the text readable in either theme. The same fades
apply to still images, which stay visible until their first canvas frame is ready.
The title stays centered, with a large Arrival logogram at the left and Gargantua
toward the upper right. The logogram's circular window includes its full ink
silhouette; layered edge fades preserve Gargantua's curved horizon.
Light mode uses deeper shadows, warmer colors and less translucency; dark mode keeps
the original palette. Engine lights breathe gently and stars twinkle slowly around
the moving disk.

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
| `assets/js/eggs/` | Pixel-art cameos: one animation loop for all of them (`index.js`), the logogram, Gargantua and the *Endurance*, the shell, shared pixel helpers |
| `assets/img/` | The logograms' ink traced from the film (`logogram-*.png`), the *Interstellar* still's light, warmth and streak directions (`gargantua-*.png`), the cameos' still frames (`egg-*.png`), the favicon |
| `assets/js/motion.js` | System motion preference and the page's explicit Play opt-in |
| `assets/css/` | `tokens.css` (themes, fonts, frames), `page.css`, `hero.css` |
| `tools/` | Checks (below) |

## Checks

```sh
make check          # data and printed numbers against the paper's stated values
make anonymity ANON_DENY="name one,name two"   # keep the list out of this folder
make verify         # browser checks; needs Playwright (npm i -D playwright)
make stills         # redraw the cameos' still frames after changing a scene
```

- `tools/check-data.mjs` verifies that each hero order is a permutation that
  reproduces its caption (Figure 2: τ = −0.085, LIS = 0.50, 13 hops; Figure 1: +0.97,
  −1.00, −0.88), that the cards sit at told 01/03/16/18 with +1, +12, +1 between, that
  the shape curves reproduce Figure 4's τ, that table splits give their rates, and that
  every number printed in `index.html` with a `data-k` attribute matches `paper.json`.
- `tools/verify.mjs` loads the page at 360, 768 and 1280 px, in day and night, with and
  without reduced motion. It fails on sideways scrolling, console errors, empty charts
  or any request to another origin, tests narrative playback, the cameos' playback and
  the hero's keyboard controls, and writes screenshots of every scene to `.preview/`.
  Set `CHROME=/path/to/chromium` to use a browser that is already installed.

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
own metadata. Keep those files when deploying. The pixel art is drawn for this page.
The cameos are homages to *Arrival* (2016) and *Interstellar* (2014): the logograms are
traced from the film's logograms for “Time” and “There is no linear time”, the
*Interstellar* scene is traced from a still of the film, and the shell follows the
film's poster.
