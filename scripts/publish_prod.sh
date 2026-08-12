#!/bin/bash

# Unless explicitly stated otherwise all files in this repository are licensed
# under the Apache License Version 2.0.
# This product includes software developed at Datadog (https://www.datadoghq.com/).
# Copyright 2021 Datadog, Inc.

# Usage -- run commands from repo root:
# Prepare a release PR:
#   ./scripts/publish_prod.sh <VERSION_NUMBER>
# Publish after the release PR is merged:
#   ./scripts/publish_prod.sh <VERSION_NUMBER> --publish
# Skip updating the layer versions:
#   UPDATE_LAYERS=false ./scripts/publish_prod.sh <VERSION_NUMBER>

set -euo pipefail

if [ -z "${1:-}" ]; then
    echo "Must specify a desired version number"
    exit 1
elif [[ ! $1 =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Must use a semantic version, e.g., 3.1.4 (note the lack of any \`v\` prefix)"
    exit 1
fi
VERSION=$1
MODE=${2:-prepare}

if [ "$MODE" != "prepare" ] && [ "$MODE" != "--publish" ]; then
    echo "Unknown mode: $MODE"
    exit 1
fi

# Ensure on main, and pull the latest
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "main" ]; then
    echo "Not on main, aborting"
    exit 1
fi

echo "Updating main branch"
gt s

# Ensure no uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo "Detected uncommitted changes, aborting"
    exit 1
fi

# Read the current version
CURRENT_VERSION=$(node -pe "require('./package.json').version")

if [ "$MODE" = "--publish" ]; then
    if [ "$CURRENT_VERSION" != "$VERSION" ]; then
        echo "package.json version is $CURRENT_VERSION, expected $VERSION"
        exit 1
    fi

    if git rev-parse -q --verify "refs/tags/v$VERSION" >/dev/null; then
        echo "Tag v$VERSION already exists, aborting"
        exit 1
    fi

    yarn build
    git tag -s -m "v$VERSION" "v$VERSION"
    git push origin "refs/tags/v$VERSION"

    echo
    echo "DONE! Please create a new release using the link below. It will trigger a GitHub action to publish to npm."
    echo "https://github.com/DataDog/serverless-plugin-datadog/releases/new?tag=v$VERSION&title=v$VERSION"
    exit 0
fi

# Check we have merged our changes
echo "Checking changes have been merged to main branch"
LAST_MERGED_COMMIT="$(git log --oneline -1)"
read -p "The most recent commit to the main branch was ${LAST_MERGED_COMMIT}. Was this your most recent change? (y/n): " CONT
if [ "$CONT" != "y" ]; then
    echo "Please merge your changes before finishing the release!"
    echo "Exiting"
    exit 1
fi

# Confirm to proceed
read -p "About to bump the version from ${CURRENT_VERSION} to ${VERSION} and create a release PR. Continue? (y/n) " CONT
if [ "$CONT" != "y" ]; then
    echo "Exiting"
    exit 1
fi

if [ "${UPDATE_LAYERS:-true}" != "false" ]; then
    read -p "About to update layer versions to the latest available from AWS. Continue? (y/n) " CONT
    if [ "$CONT" != "y" ]; then
        echo "Exiting"
        exit 1
    fi

    echo "If an SSO authorization link is printed below, please make sure to authorize it with your GovCloud account."
    aws-vault exec sso-govcloud-us1-fed-engineering -- aws sts get-caller-identity

    echo "If an SSO authorization link is printed below, please make sure to authorize it with your datadoghq.com account."
    aws-vault exec sso-prod-engineering -- aws sts get-caller-identity

    echo "Updating layer versions for GovCloud AWS accounts"
    aws-vault exec sso-govcloud-us1-fed-engineering -- ./scripts/generate_layers_json.sh -g

    echo "Updating layer versions for commercial AWS accounts"
    aws-vault exec sso-prod-engineering -- ./scripts/generate_layers_json.sh
fi

echo
echo "Bumping the version number and creating a release PR"
yarn version "$VERSION"
git cr chore "release $VERSION"

echo
printf 'After the PR merges, run: ./scripts/publish_prod.sh %s --publish\n' "$VERSION"
