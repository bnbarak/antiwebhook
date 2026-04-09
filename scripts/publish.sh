#!/bin/bash
set -e

# Publish all SDKs to their registries.
# Usage: ./scripts/publish.sh [npm|pip|express|fastify|flask|django|all]
#
# Requires:
#   npm: .npmrc with auth token OR NPM_TOKEN env var
#   pip: TWINE_USERNAME + TWINE_PASSWORD env vars

SCOPE="${1:-all}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

publish_core() {
  echo "📦 Publishing @simplehook/core to npm..."
  cd "$ROOT/javascript/sdk/core"
  npx tsc
  npm publish --access public
  echo "✅ @simplehook/core@$(node -p 'require("./package.json").version')"
}

publish_express() {
  echo "📦 Publishing @simplehook/express to npm..."
  cd "$ROOT/javascript/sdk/express"
  npx tsc
  npm publish --access public
  echo "✅ @simplehook/express@$(node -p 'require("./package.json").version')"
}

publish_fastify() {
  echo "📦 Publishing @simplehook/fastify to npm..."
  cd "$ROOT/javascript/sdk/fastify"
  npx tsc
  npm publish --access public
  echo "✅ @simplehook/fastify@$(node -p 'require("./package.json").version')"
}

publish_hono() {
  echo "📦 Publishing @simplehook/hono to npm..."
  cd "$ROOT/javascript/sdk/hono"
  npx tsc
  npm publish --access public
  echo "✅ @simplehook/hono@$(node -p 'require("./package.json").version')"
}

publish_cli() {
  echo "📦 Publishing @simplehook/cli to npm..."
  cd "$ROOT/javascript/sdk/cli"
  npx tsc
  npm publish --access public
  echo "✅ @simplehook/cli@$(node -p 'require("./package.json").version')"
}

publish_mastra() {
  echo "📦 Publishing @simplehook/mastra to npm..."
  cd "$ROOT/javascript/sdk/mastra"
  npx tsc
  npm publish --access public
  echo "✅ @simplehook/mastra@$(node -p 'require("./package.json").version')"
}

publish_flask() {
  echo "📦 Publishing simplehook-flask to PyPI..."
  cd "$ROOT/python/flask"
  rm -rf dist/
  python3 -m build
  python3 -m twine upload dist/*
  echo "✅ simplehook-flask published"
}

publish_django() {
  echo "📦 Publishing simplehook-django to PyPI..."
  cd "$ROOT/python/django"
  rm -rf dist/
  python3 -m build
  python3 -m twine upload dist/*
  echo "✅ simplehook-django published"
}

case "$SCOPE" in
  npm)
    publish_core; echo ""
    publish_express; echo ""
    publish_fastify; echo ""
    publish_hono; echo ""
    publish_cli; echo ""
    publish_mastra
    ;;
  pip)      publish_flask; echo ""; publish_django ;;
  core)     publish_core ;;
  express)  publish_express ;;
  fastify)  publish_fastify ;;
  hono)     publish_hono ;;
  cli)      publish_cli ;;
  mastra)   publish_mastra ;;
  flask)    publish_flask ;;
  django)   publish_django ;;
  all)
    publish_core; echo ""
    publish_express; echo ""
    publish_fastify; echo ""
    publish_hono; echo ""
    publish_cli; echo ""
    publish_mastra; echo ""
    publish_flask; echo ""
    publish_django; echo ""
    echo "🎉 All 8 SDKs published!"
    ;;
  *)
    echo "Usage: $0 [npm|pip|core|express|fastify|hono|cli|mastra|flask|django|all]"
    exit 1
    ;;
esac
