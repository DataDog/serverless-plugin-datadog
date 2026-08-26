#!/bin/bash

# Unless explicitly stated otherwise all files in this repository are licensed
# under the Apache License Version 2.0.
# This product includes software developed at Datadog (https://www.datadoghq.com/).
# Copyright 2021 Datadog, Inc.

# Usage -- run commands from repo root:
# Prepare a release PR:
#   ./scripts/publish_prod.sh <VERSION_NUMBER>
# Publish after the release PR is merged:
#   ./scripts/publish_prod.sh --publish

set -euo pipefail

if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <VERSION_NUMBER> | --publish"
    exit 1
fi

MODE=$1
if [ "$MODE" != "--publish" ]; then
    VERSION=$MODE
    MODE=prepare
    if [[ ! $VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        echo "Must specify a semantic version, e.g., 3.1.4 (note the lack of any \`v\` prefix)"
        exit 1
    fi
fi

# Ensure on main, and pull the latest
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "main" ]; then
    echo "Not on main, aborting"
    exit 1
fi

echo "Updating main branch"
git pull --ff-only origin main

# Ensure no uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo "Detected uncommitted changes, aborting"
    exit 1
fi

# Read the current version
CURRENT_VERSION=$(node -pe "require('./package.json').version")

if [ "$MODE" = "--publish" ]; then
    VERSION=$CURRENT_VERSION

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
read -r -p "The most recent commit to the main branch was ${LAST_MERGED_COMMIT}. Was this your most recent change? (y/n): " CONT
if [ "$CONT" != "y" ]; then
    echo "Please merge your changes before finishing the release!"
    echo "Exiting"
    exit 1
fi

# Confirm to proceed
read -r -p "About to bump the version from ${CURRENT_VERSION} to ${VERSION} and create a release PR. Continue? (y/n) " CONT
if [ "$CONT" != "y" ]; then
    echo "Exiting"
    exit 1
fi

echo
echo "Bumping the version number and creating a release PR"
yarn version "$VERSION"
RELEASE_BRANCH="release/v$VERSION"
git switch -c "$RELEASE_BRANCH"
git add package.json
git commit -m "v$VERSION"
git push --set-upstream origin "$RELEASE_BRANCH"
gh pr create --base main --head "$RELEASE_BRANCH" --title "v$VERSION" --body "Release v$VERSION."

echo
printf 'After the PR merges, switch to main and run: ./scripts/publish_prod.sh --publish\n'
