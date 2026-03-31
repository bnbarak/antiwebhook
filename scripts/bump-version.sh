#!/bin/bash
set -e

# Bump version across all SDKs.
# Usage: ./scripts/bump-version.sh <new-version>
# Example: ./scripts/bump-version.sh 0.4.0
#
# Updates version in:
#   - javascript/sdk/express/package.json
#   - javascript/sdk/fastify/package.json
#   - javascript/sdk/core/package.json
#   - python/flask/pyproject.toml
#   - python/django/pyproject.toml
#   - python/core/pyproject.toml

VERSION="${1:?Usage: $0 <new-version>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Bumping all SDKs to version ${VERSION}..."

# Node.js packages
for pkg in "$ROOT/javascript/sdk/express" "$ROOT/javascript/sdk/fastify" "$ROOT/javascript/sdk/core"; do
  cd "$pkg"
  npm version "$VERSION" --no-git-tag-version 2>/dev/null || true
  echo "  ✓ $(basename "$pkg"): $(node -p 'require("./package.json").version')"
done

# Python packages
for pkg in "$ROOT/python/flask" "$ROOT/python/django" "$ROOT/python/core"; do
  cd "$pkg"
  sed -i '' "s/^version = \".*\"/version = \"${VERSION}\"/" pyproject.toml
  current=$(grep '^version' pyproject.toml | head -1 | sed 's/version = "\(.*\)"/\1/')
  echo "  ✓ $(basename "$pkg"): ${current}"
done

echo ""
echo "Done! Now run:"
echo "  git add -A && git commit -m 'Bump all SDKs to v${VERSION}'"
echo "  ./scripts/publish.sh all"
