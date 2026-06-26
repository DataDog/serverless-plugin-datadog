#!/usr/bin/env bash
# Builds the plugin, packs it into a tarball, and installs it into the workload
# fixture alongside the Serverless Framework.
#
# Why a tarball and not `file:../../..`: npm's file: protocol whole-dir-links the
# target, and the repo root contains this fixture -- which would link back to the
# repo, recursing forever. A packed tarball respects .npmignore (dist only) and
# extracts cleanly, the same approach the datadog-ci e2e suite uses for artifacts.
set -euo pipefail

cd "$(dirname "$0")"
E2E_DIR="$PWD"

echo "==> Building plugin"
(cd .. && COREPACK_ENABLE_DOWNLOAD_PROMPT=0 yarn build)

echo "==> Packing plugin"
rm -f "$E2E_DIR"/serverless-plugin-datadog-*.tgz
TARBALL_NAME=$(cd .. && npm pack --silent --pack-destination "$E2E_DIR")
TARBALL="$E2E_DIR/$TARBALL_NAME"
echo "    packed $TARBALL_NAME"

echo "==> Installing workload fixture"
cd fixtures/lambda-node
npm install --no-audit --no-fund
# --no-save so the committed fixture package.json stays free of a local tarball path.
npm install --no-audit --no-fund --no-save "$TARBALL"

echo "==> Setup complete"
