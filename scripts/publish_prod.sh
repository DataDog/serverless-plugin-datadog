#!/bin/bash

# Unless explicitly stated otherwise all files in this repository are licensed
# under the Apache License Version 2.0.
# This product includes software developed at Datadog (https://www.datadoghq.com/).
# Copyright 2019 Datadog, Inc.

set -e

# Ensure on master, and pull the latest
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ $BRANCH != "master" ]; then
    echo "Not on master, aborting"
    exit 1
else
    echo "Updating master"
    git pull origin master
fi

root_dir=$(pwd)
if [[ "$root_dir" =~ .*"serverless-plugin-datadog/scripts".* ]]; then
    echo "Make sure to run this script from the root `serverless-plugin-datadog` directory, aborting"
    exit 1
fi

# Ensure no uncommitted changes
if [ -n "$(git status --porcelain)" ]; then 
    echo "Detected uncommitted changes, aborting"
    exit 1
fi

# Read the current version
CURRENT_VERSION=$(node -pe "require('./package.json').version")

# Read the desired version
if [ -z "$1" ]; then
    echo "Must specify a desired version number"
    exit 1
elif [[ ! $1 =~ [0-9]+\.[0-9]+\.[0-9]+ ]]; then
    echo "Must use a semantic version, e.g., 3.1.4"
    exit 1
else
    VERSION=$1
fi

# Confirm to proceed
read -p "About to bump the version from ${CURRENT_VERSION} to ${VERSION}, and publish. Continue (y/n)?" CONT
if [ "$CONT" != "y" ]; then
    echo "Exiting"
    exit 1
fi

# Verify NPM access before updating layer arns (slow)
yarn login

if [ "$UPDATE_LAYERS" == "true" ]; then
    # Verify AWS access before running the time-consuming generate_layers_json.sh
    saml2aws login -a govcloud-us1-fed-human-engineering
    AWS_PROFILE=govcloud-us1-fed-human-engineering aws sts get-caller-identity
    aws-vault exec prod-engineering -- aws sts get-caller-identity

    echo "Updating layer versions for GovCloud AWS accounts"
    AWS_PROFILE=govcloud-us1-fed-human-engineering ./scripts/generate_layers_json.sh -g

    echo "Updating layer versions for commercial AWS accounts"
    aws-vault exec prod-engineering -- ./scripts/generate_layers_json.sh

    # Commit layer updates if needed
    if [[ $(git status --porcelain) == *"src/layers"* ]]; then
        echo "Layers updated, committing changes"
        git commit src/layers.json src/layers-gov.json -m "Update layer versions"
    fi
fi

echo "Bumping the version number and committing the changes"
yarn version --new-version "$VERSION"

yarn test
yarn build
echo "Updating snapshots for integration tests"
UPDATE_SNAPSHOTS=true ./scripts/run_integration_tests.sh

echo 'Publishing to Node'
yarn publish --new-version "$VERSION"

echo 'Pushing updates to github'
git push origin master
git push origin "refs/tags/v$VERSION"

echo "DONE! Please create a new release using the link below."
echo "https://github.com/DataDog/serverless-plugin-datadog/releases/new?tag=v$VERSION&title=v$VERSION"