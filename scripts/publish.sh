#!/bin/bash
set -e

# Publish all SDKs to their registries.
# Usage: ./scripts/publish.sh [npm|pip|all]
#
# Requires:
#   npm: .npmrc with auth token in javascript/sdk/express/
#   pip: TWINE_USERNAME=__token__ TWINE_PASSWORD=pypi-... in env

SCOPE="${1:-all}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# -- npm (Express SDK) --
publish_npm() {
  echo "📦 Publishing simplehook to npm..."
  cd "$ROOT/javascript/sdk/express"
  npx tsc
  npm publish --access public
  echo "✅ npm: simplehook@$(node -p 'require("./package.json").version')"
}

# -- pip (Flask SDK) --
publish_pip() {
  echo "📦 Publishing simplehook-flask to PyPI..."
  cd "$ROOT/python/flask"
  rm -rf dist/
  python3 -m build
  python3 -m twine upload dist/*
  VERSION=$(python3 -c "import tomllib; print(tomllib.load(open('pyproject.toml','rb'))['project']['version'])")
  echo "✅ pip: simplehook-flask@${VERSION}"
}

case "$SCOPE" in
  npm)  publish_npm ;;
  pip)  publish_pip ;;
  all)
    publish_npm
    echo ""
    publish_pip
    echo ""
    echo "🎉 All SDKs published!"
    ;;
  *)
    echo "Usage: $0 [npm|pip|all]"
    exit 1
    ;;
esac
