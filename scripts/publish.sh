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

publish_express() {
  echo "📦 Publishing simplehook (Express) to npm..."
  cd "$ROOT/javascript/sdk/express"
  npx tsc
  npm publish --access public
  echo "✅ simplehook@$(node -p 'require("./package.json").version')"
}

publish_fastify() {
  echo "📦 Publishing simplehook-fastify to npm..."
  cd "$ROOT/javascript/sdk/fastify"
  npx tsc
  npm publish --access public
  echo "✅ simplehook-fastify@$(node -p 'require("./package.json").version')"
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
  npm)      publish_express; echo ""; publish_fastify ;;
  pip)      publish_flask; echo ""; publish_django ;;
  express)  publish_express ;;
  fastify)  publish_fastify ;;
  flask)    publish_flask ;;
  django)   publish_django ;;
  all)
    publish_express; echo ""
    publish_fastify; echo ""
    publish_flask; echo ""
    publish_django; echo ""
    echo "🎉 All 4 SDKs published!"
    ;;
  *)
    echo "Usage: $0 [npm|pip|express|fastify|flask|django|all]"
    exit 1
    ;;
esac
