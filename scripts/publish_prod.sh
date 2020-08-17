#!/bin/bash

# Unless explicitly stated otherwise all files in this repository are licensed
# under the Apache License Version 2.0.
# This product includes software developed at Datadog (https://www.datadoghq.com/).
# Copyright 2019 Datadog, Inc.

set -e

BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ $BRANCH != "master" ]; then
    echo "Not on master, aborting"
    exit 1
fi

if [ -z "$AWS_ACCESS_KEY_ID" ]; then
    echo 'AWS_ACCESS_KEY_ID not set. Are you using aws-vault?'
    exit 1
fi

if [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
    echo 'AWS_SECRET_ACCESS_KEY not set. Are you using aws-vault?'
    exit 1
fi

if [ -z "$AWS_SESSION_TOKEN" ]; then
    echo 'AWS_SESSION_TOKEN not set. Are you using aws-vault?'
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

yarn login

echo "Updating layer versions"
./scripts/generate_layers_json.sh

files_changed=$(git status --porcelain)
if [[ $files_changed == *"src/layers.json"* ]]; then
    echo "Layers updated, committing changes"
    git commit src/layers.json -m "Update layer versions"
fi

echo "Bumping the version number and committing the changes"
yarn version --new-version "$VERSION"

echo 'Publishing to Node'
yarn test
yarn build
yarn publish --new-version "$VERSION"

echo 'Pushing updates to github'
git push origin master
git push origin "refs/tags/v$VERSION"