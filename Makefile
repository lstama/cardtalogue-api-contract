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
#   - oapi-codegen v2 (go install github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen@latest)
#   - openapi-typescript (npx openapi-typescript)      -> make generate-ts
#   - openapi-python-client (uv venv, see `make install-py-gen`) -> make generate-py
#
# In this sandbox only the npm-based targets (validate, bundle, check-orphan-calls)
# run; the rest are provided for normal CI/dev environments.
#
# NOTE: `go install` and `npx` work here (network is open). Python needs a venv
# because Arch Linux blocks system pip (PEP 668): `make install-py-gen` creates
# .venv-gen and installs openapi-python-client into it.

CONTRACT_VERSION := $(shell cat CONTRACT_VERSION 2>/dev/null)

# oapi-codegen lives in GOPATH/bin; put it on PATH so `make generate` works
# without manual PATH setup.
export PATH := $(shell go env GOPATH)/bin:$(PATH)

BACKEND := contracts/backend.yaml
SCANNER := contracts/scanner.yaml
DIST := dist/openapi.yaml
REPOS ?= ../cardtalogue-frontend:../cardtalogue-backend

.PHONY: all validate lint bundle breaking-check mock docs generate \
        generate-go generate-ts generate-py install-py-gen sync-contract verify-contract \
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
	@echo "  install-py-gen      Create .venv-gen and install openapi-python-client"
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

# oapi-codegen v2 generate modes: types,gin,client,nethttp,chi,echo,fiber,iris,lambda,nethttp
# We emit types + gin handlers (the backend uses Gin). `client`/`nethttp` omitted on purpose.
generate-go:
	oapi-codegen -package tcgcontract -generate types,gin -o gen/go/backend.gen.go $(BACKEND)
	oapi-codegen -package tcgcontract -generate types,gin -o gen/go/scanner.gen.go $(SCANNER)

generate-ts:
	npx -y openapi-typescript $(BACKEND) -o gen/ts/backend.ts
	npx -y openapi-typescript $(SCANNER) -o gen/ts/scanner.ts

generate-py:
	@if [ ! -x .venv-gen/bin/openapi-python-client ]; then \
		echo "openapi-python-client not installed; run: make install-py-gen"; exit 1; \
	fi
	.venv-gen/bin/openapi-python-client generate --path $(SCANNER) --meta uv --output-path gen/py/scanner --overwrite

# Arch Linux blocks `pip install --system` (PEP 668 externally-managed). Use a uv venv.
install-py-gen:
	uv venv .venv-gen --python 3.14
	uv pip install --python .venv-gen/bin/python openapi-python-client

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

