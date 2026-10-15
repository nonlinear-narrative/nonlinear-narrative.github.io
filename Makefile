PORT ?= 8000
URL ?= http://127.0.0.1:$(PORT)/

.PHONY: serve check anonymity verify

serve:
	python3 -m http.server $(PORT) --bind 127.0.0.1

check:
	node tools/check-data.mjs

anonymity:
	ANON_DENY="$(ANON_DENY)" node tools/check-anonymity.mjs

# Needs a running server (make serve) and Playwright.
verify:
	node tools/verify.mjs --url $(URL) --out .preview
