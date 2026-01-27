#!/bin/bash

# Unless explicitly stated otherwise all files in this repository are licensed
# under the Apache License Version 2.0.
# This product includes software developed at Datadog (https://www.datadoghq.com/).
# Copyright 2021 Datadog, Inc.

# Usage - run commands from repo root:
# To publish a new version:
#   ./scripts/publish_prod.sh <VERSION_NUMBER>
# To publish a new version without updating the layer versions:
#   UPDATE_LAYERS=false ./scripts/publish_prod.sh <VERSION_NUMBER>

set -e

# Ensure on main, and pull the latest
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ $BRANCH != "main" ]; then
    echo "Not on main, aborting"
    exit 1
else
    echo "Updating main branch"
    git pull origin main
fi

# Ensure no uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
    echo "Detected uncommitted changes, aborting"
    exit 1
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

# Read the current version
CURRENT_VERSION=$(node -pe "require('./package.json').version")

# Read the desired version
if [ -z "$1" ]; then
    echo "Must specify a desired version number"
    exit 1
elif [[ ! $1 =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Must use a semantic version, e.g., 3.1.4 (note the lack of any \`v\` prefix)"
    exit 1
else
    VERSION=$1
fi

# Confirm to proceed
read -p "About to bump the version from ${CURRENT_VERSION} to ${VERSION}, and publish. Continue? (y/n)" CONT
if [ "$CONT" != "y" ]; then
    echo "Exiting"
    exit 1
fi

if [ "$UPDATE_LAYERS" != "false" ]; then
    read -p "About to update layer versions to the latest available from AWS. Continue? (y/n)" CONT
    if [ "$CONT" != "y" ]; then
        echo "Exiting"
        exit 1
    fi
fi

if [ "$UPDATE_LAYERS" != "false" ]; then
    echo "If an SSO authorization link is printed below, please make sure to authorize it with your GovCloud account."
    aws-vault exec sso-govcloud-us1-fed-engineering -- aws sts get-caller-identity

    echo "If an SSO authorization link is printed below, please make sure to authorize it with your datadoghq.com account."
    aws-vault exec sso-prod-engineering -- aws sts get-caller-identity

    echo "Updating layer versions for GovCloud AWS accounts"
    aws-vault exec sso-govcloud-us1-fed-engineering -- ./scripts/generate_layers_json.sh -g

    echo "Updating layer versions for commercial AWS accounts"
    aws-vault exec sso-prod-engineering -- ./scripts/generate_layers_json.sh

    # Commit layer updates if needed
    if [[ $(git status --porcelain) == *"src/layers"* ]]; then
        echo "Layers updated, committing changes"
        git commit src/layers.json src/layers-gov.json -m "Update layer versions"
    fi
fi

echo
echo "Bumping the version number and committing the changes"
yarn version "$VERSION"
git commit -am "v$VERSION"
git tag "v$VERSION"

yarn build

echo
echo 'Pushing updates to GitHub'
git push origin main
git push origin "refs/tags/v$VERSION"

echo
echo "DONE! Please create a new release using the link below. It will trigger a GitHub action to publish to npm."
echo "https://github.com/DataDog/serverless-plugin-datadog/releases/new?tag=v$VERSION&title=v$VERSION"
