#!/bin/bash
set -e

VERSION=$1

if [ -z "$VERSION" ]; then
  echo "Uso: ./scripts/release-notes.sh v1.2.3"
  exit 1
fi

CHANGELOG_FILE="CHANGELOG.md"
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
TIMESTAMP=$(date '+%Y-%m-%d')

if [ -z "$LAST_TAG" ]; then
  COMMITS=$(git log --pretty=format:"- %s" HEAD)
else
  COMMITS=$(git log --pretty=format:"- %s" "${LAST_TAG}..HEAD")
fi

ENTRY="## ${VERSION} (${TIMESTAMP})

${COMMITS}

"

if [ -f "$CHANGELOG_FILE" ]; then
  EXISTING=$(cat "$CHANGELOG_FILE")
  printf '%s\n%s' "$ENTRY" "$EXISTING" > "$CHANGELOG_FILE"
else
  printf '# CHANGELOG\n\n%s' "$ENTRY" > "$CHANGELOG_FILE"
fi

echo "→ ${CHANGELOG_FILE} atualizado com release ${VERSION}"
