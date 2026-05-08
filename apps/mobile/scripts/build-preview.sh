#!/bin/bash
set -e

echo "→ Rodando testes unitários..."
npm test -- --watchAll=false

echo "→ Verificando tipos TypeScript..."
npm run type-check

echo "→ Build EAS preview (iOS)..."
eas build --platform ios --profile preview --non-interactive

echo "→ Build EAS preview (Android)..."
eas build --platform android --profile preview --non-interactive

echo "✓ Builds submetidos. Acompanhe em https://expo.dev"
