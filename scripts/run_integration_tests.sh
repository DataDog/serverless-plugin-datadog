#!/bin/bash

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
    echo "Overwriting correct_snapshot.json in this execution"
fi

cd $integration_tests_dir
yarn

# Add local build to node_modules so `serverless-plugin.yml` also has access to local build.
cd $root_dir
yarn
yarn build
rm -rf "$integration_tests/node_modules"
mkdir -p "$integration_tests_dir/node_modules/serverless-plugin-datadog"
cp -r dist "$integration_tests_dir/node_modules/serverless-plugin-datadog"

cd $integration_tests_dir
serverless package --config ./serverless-forwarder.yml

if [ -n "$UPDATE_SNAPSHOTS" ]; then
    cp .serverless/cloudformation-template-update-stack.json correct_snapshot.json
fi

cp .serverless/cloudformation-template-update-stack.json test_snapshot.json
echo "Asserting test_snapshot.json against correct_snapshot.json"
set +e # Dont exit right away if there is a diff in snapshots
diff <(grep -vE "("S3Key".*)|(.HelloLambdaVersion.*)|("CodeSha256".*)" correct_snapshot.json) <(grep -vE "("S3Key".*)|(.HelloLambdaVersion.*)|("CodeSha256".*)" test_snapshot.json) 
return_code=$?

set -e
if [[ $return_code -eq 0 ]]; then
    echo "SUCCESS: test_snapshot.json and correct_snapshot.json were the same, the integration test has passed."
    if [ -n "$UPDATE_SNAPSHOTS" ]; then
        echo "Staging and commiting new correct_snapshot.json"
        cd $root_dir
        git add .
        git commit -m "Update correct_snapshot.json for integration test"
    fi
    exit 0
else
    echo "FAILURE: test_snapshot.json differed from the correct_snapshot.json file, the integration."
    echo "If you expected the snapshot to be different, generate new snapshots using: 'UPDATE_SNAPSHOTS=true ./scripts/run_integration_tests.sh'"
    exit 1
fi
