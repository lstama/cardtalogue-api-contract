# Cardtalogue API contract tooling.
#
# The contracts in contracts/ are the source of truth. Everything else is derived:
#   - generated client/server code in gen/
#   - a bundled single-file spec in dist/
#   - a mock server (Prism) for frontend/scanner development
#   - interactive docs (Redocly)
#
# Tools used by these targets (install in a normal environment):
#   - Spectral        (npm i -g @stoplight/spectral)   -> make lint
#   - @apidevtools/swagger-parser (npm)                -> make bundle
#   - oasdiff         (go install github.com/oasdiff/oasdiff/...) -> make breaking-check
#   - Prism           (npm i -g @stoplight/prism-cli)  -> make mock
#   - Redocly CLI     (npm i -g @redocly/redocly)      -> make docs
#   - oapi-codegen    (go install github.com/deepmap/oapi-codegen/...) -> make generate
#   - openapi-python-client (pip install openapi-python-client) -> make generate
#
# In this sandbox only the npm-based targets (validate, bundle, check-orphan-calls)
# run; the rest are provided for normal CI/dev environments.

CONTRACT_VERSION := $(shell cat CONTRACT_VERSION 2>/dev/null)
BACKEND := contracts/backend.yaml
SCANNER := contracts/scanner.yaml
DIST := dist/openapi.yaml
REPOS ?= ../cardtalogue-frontend:../cardtalogue-backend

.PHONY: all validate lint bundle breaking-check mock docs generate \
        generate-go generate-ts generate-py sync-contract verify-contract \
        check-orphan-calls clean help

all: validate lint bundle check-orphan-calls

help:
	@echo "Targets:"
	@echo "  validate            Validate both contracts with swagger-parser"
	@echo "  lint                Spectral lint (operationId/summary/description/examples/tags)"
	@echo "  bundle              Bundle contracts into a single dist/openapi.yaml"
	@echo "  breaking-check      Check for breaking changes vs the last git tag (oasdiff)"
	@echo "  mock                Start a Prism mock server for both contracts"
	@echo "  docs                Build Redocly docs into dist/docs.html"
	@echo "  generate            Generate Go/TS/Python code from the contracts"
	@echo "  sync-contract       Fetch the pinned CONTRACT_VERSION tag into each consumer"
	@echo "  verify-contract     validate + lint + check-orphan-calls + breaking-check"
	@echo "  check-orphan-calls  Ensure no orphan frontend/backend->scanner calls"
	@echo "  clean               Remove generated artifacts"

# --- validation -------------------------------------------------------------
validate:
	node scripts/validate.mjs

# --- lint -------------------------------------------------------------------
lint:
	spectral lint $(BACKEND) $(SCANNER) --ruleset .spectral.yaml

# --- bundle -----------------------------------------------------------------
bundle:
	node scripts/bundle.mjs

# --- breaking-change detection ----------------------------------------------
breaking-check:
	@if [ -z "$(CONTRACT_VERSION)" ]; then \
		echo "CONTRACT_VERSION is empty; nothing to compare against"; exit 1; \
	fi
	@if ! git rev-parse "v$(CONTRACT_VERSION)" >/dev/null 2>&1; then \
		echo "no tag v$(CONTRACT_VERSION) to compare against"; exit 0; \
	fi
	oasdiff breaking "v$(CONTRACT_VERSION)" HEAD \
		--paths "$(BACKEND)" || { echo "BREAKING CHANGE DETECTED"; exit 1; }

# --- mock server ------------------------------------------------------------
mock:
	prism mock $(BACKEND) --port 8080 &
	prism mock $(SCANNER) --port 5000 &
	@echo "mock servers starting (backend :8080, scanner :5000)"

# --- docs -------------------------------------------------------------------
docs:
	redocly bundle $(BACKEND) -o dist/backend.html
	redocly bundle $(SCANNER) -o dist/scanner.html

# --- code generation --------------------------------------------------------
generate: generate-go generate-ts generate-py

generate-go:
	oapi-codegen -package tcgcontract -o gen/go/backend.gen.go $(BACKEND)
	oapi-codegen -package tcgcontract -o gen/go/scanner.gen.go $(SCANNER)

generate-ts:
	oapi-codegen -package tcgcontract -o gen/ts/backend.gen.ts $(BACKEND)
	oapi-codegen -package tcgcontract -o gen/ts/scanner.gen.ts $(SCANNER)

generate-py:
	openapi-python-client generate $(BACKEND) -o gen/py/backend
	openapi-python-client generate $(SCANNER) -o gen/py/scanner

# --- contract distribution --------------------------------------------------
# Each consumer pins a CONTRACT_VERSION tag. `sync-contract` checks out that tag
# into a vendored copy inside each consumer repo. Local override:
#   CONTRACT_PATH=../cardtalogue-api-contract make generate
sync-contract:
	@echo "syncing contract v$(CONTRACT_VERSION) into consumers ($(REPOS))"
	@for repo in $(REPOS); do \
		if [ -d "$$repo" ]; then \
			mkdir -p "$$repo/contract"; \
			git archive "$(CONTRACT_VERSION)" | tar -x -C "$$repo/contract"; \
			echo "  synced $$repo/contract"; \
		else \
			echo "  skip (missing) $$repo"; \
		fi; \
	done

# --- end-to-end verification ------------------------------------------------
verify-contract: validate lint check-orphan-calls breaking-check

check-orphan-calls:
	REPOS=$(REPOS) node scripts/check-orphan-calls.mjs

clean:
	rm -rf dist gen/go gen/ts gen/py mock

