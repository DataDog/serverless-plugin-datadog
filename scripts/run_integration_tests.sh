#!/bin/bash

# Usage - run commands from repo root:
# To check if new changes to the plugin cause changes to any snapshots:
#   ./scripts/run_integration_tests
# To regenerate snapshots:
#   UPDATE_SNAPSHOTS=true ./scripts/run_integration_tests

set -e

script_path=${BASH_SOURCE[0]}
scripts_dir=$(dirname $script_path)
repo_dir=$(dirname $scripts_dir)
root_dir=$(pwd)
#/Users/andrew.rodriguez/go/src/github.com/DataDog/serverless-plugin-datadog
if [[ "$root_dir" =~ .*"serverless-plugin-datadog/scripts".* ]]; then
    echo "Make sure to run this script from the root `serverless-plugin-datadog` directory, aborting"
    exit 1
fi

integration_tests_dir="$repo_dir/integration_tests"

if [ -n "$UPDATE_SNAPSHOTS" ]; then
    echo "Overwriting snapshots in this execution"
fi

cd $integration_tests_dir
yarn

# Add local build to node_modules so `serverless-forwarder.yml` and `serverless-extension.yml` also have access to local build.
cd $root_dir
yarn
yarn build
rm -rf "$integration_tests/node_modules"
mkdir -p "$integration_tests_dir/node_modules/serverless-plugin-datadog"
cp -r dist "$integration_tests_dir/node_modules/serverless-plugin-datadog"

cd $integration_tests_dir
echo "Running 'sls package' with 'serverless-forwarder.yml'"
serverless package --config ./serverless-forwarder.yml
cp .serverless/cloudformation-template-update-stack.json test_forwarder_snapshot.json
echo "===================================="
echo "Running 'sls package' with 'serverless-extension.yml'"
serverless package --config ./serverless-extension.yml
cp .serverless/cloudformation-template-update-stack.json test_extension_snapshot.json


if [ -n "$UPDATE_SNAPSHOTS" ]; then
    echo "Overriding correct snapshots"
    cp test_forwarder_snapshot.json correct_forwarder_snapshot.json
    cp test_extension_snapshot.json correct_extension_snapshot.json
fi

echo "Performing diff of test_forwarder_snapshot.json against correct_forwarder_snapshot.json"
set +e # Dont exit right away if there is a diff in snapshots
# Use grep to remove fields following this regex as they are not consistent with each CFN template generation.
diff <(grep -vE "("S3Key".*)|(.HelloLambdaVersion.*)|("CodeSha256".*)" correct_forwarder_snapshot.json) <(grep -vE "("S3Key".*)|(.HelloLambdaVersion.*)|("CodeSha256".*)" test_forwarder_snapshot.json) 
forwarder_return_code=$?
echo "===================================="
echo "Performing diff of test_extension_snapshot.json against correct_extension_snapshot.json"
diff <(grep -vE "("S3Key".*)|(.HelloLambdaVersion.*)|("CodeSha256".*)" correct_extension_snapshot.json) <(grep -vE "("S3Key".*)|(.HelloLambdaVersion.*)|("CodeSha256".*)" test_extension_snapshot.json) 
extension_return_code=$?

echo "===================================="
set -e
if [ $forwarder_return_code -eq 0 ] && [ $extension_return_code -eq 0 ]; then
    echo "SUCCESS: Both forwarder and extension snapshot integration tests have passed. There were no differences between the test and correct snapshots"
    if [ -n "$UPDATE_SNAPSHOTS" ]; then
        echo "Staging and commiting new correct snapshots"
        cd $root_dir
        git add .
        git commit -m "Update correct_forwarder_snapshot.json and correct_extension_snapshot.json for snapshot integration tests"
    fi
    exit 0
else
    echo "FAILURE: Either the forwarder, extension, or both snapshot integration tests failed. Review the diff output above."
    echo "If you expected the snapshots to be different, generate new snapshots using: 'UPDATE_SNAPSHOTS=true ./scripts/run_integration_tests.sh'"
    exit 1
fi
