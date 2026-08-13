#!/usr/bin/env bash
set -euo pipefail

: "${SERVERLESS_PACKAGE:?SERVERLESS_PACKAGE must be set}"

workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT

npm pack --pack-destination "$workdir" --silent >/dev/null
mkdir "$workdir/fixture"

cat >"$workdir/fixture/package.json" <<'EOF'
{"private": true}
EOF

cat >"$workdir/fixture/serverless.yml" <<'EOF'
service: serverless-plugin-datadog-compatibility

plugins:
  - serverless-plugin-datadog

provider:
  name: aws
  runtime: nodejs24.x

functions:
  hello:
    handler: handler.hello

custom:
  datadog:
    apiKey: placeholder
    addLayers: true
    addExtension: true
    enableDDTracing: true
    enableDDLogs: true
    enableSourceCodeIntegration: false
    uploadGitMetadata: false
EOF

cat >"$workdir/fixture/handler.js" <<'EOF'
exports.hello = async () => ({statusCode: 200});
EOF

npm install --prefix "$workdir/fixture" --no-audit --no-fund --legacy-peer-deps \
  "$SERVERLESS_PACKAGE" "$workdir"/serverless-plugin-datadog-*.tgz
(
  cd "$workdir/fixture"
  ./node_modules/.bin/osls package
)
