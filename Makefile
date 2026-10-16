PORT ?= 8000
URL ?= http://127.0.0.1:$(PORT)/

.PHONY: serve check anonymity verify stills

serve:
	python3 -m http.server $(PORT) --bind 127.0.0.1

check:
	node tools/check-data.mjs

anonymity:
	ANON_DENY="$(ANON_DENY)" node tools/check-anonymity.mjs

# Needs a running server (make serve) and Playwright.
verify:
	node tools/verify.mjs --url $(URL) --out .preview

# Still frames of the pixel-art cameos, for pages without scripts. Needs a running server and Playwright.
stills:
	node tools/render-stills.mjs --url $(URL)
