#!/bin/bash

# Usage - run commands from repo root:
# To check if new changes to the plugin cause changes to any snapshots:
#   ./scripts/run_integration_tests
# To regenerate snapshots:
#   UPDATE_SNAPSHOTS=true ./scripts/run_integration_tests

set -e

# To add new tests create a new yml file, append it to SERVERLESS_CONFIGS as well as creating a name for the snapshots that will be compared in your test.
# Note: Each yml config, test, and correct snapshot file should be at the same index in their own array. e.g. All the files for the forwarder test are at index 0.
#       In order for this script to work correctly these arrays should have the same amount of elements.
SERVERLESS_CONFIGS=("./serverless-forwarder.yml" "./serverless-extension.yml")
TEST_SNAPSHOTS=("test_forwarder_snapshot.json" "test_extension_snapshot.json")
CORRECT_SNAPSHOTS=("correct_forwarder_snapshot.json" "correct_extension_snapshot.json")

script_path=${BASH_SOURCE[0]}
scripts_dir=$(dirname $script_path)
repo_dir=$(dirname $scripts_dir)
root_dir=$(pwd)
if [[ "$root_dir" =~ .*"serverless-plugin-datadog/scripts".* ]]; then
    echo "Make sure to run this script from the root `serverless-plugin-datadog` directory, aborting"
    exit 1
fi

integration_tests_dir="$repo_dir/integration_tests"
if [ -n "$UPDATE_SNAPSHOTS" ]; then
    echo "Overwriting snapshots in this execution"
fi


yarn
yarn build

cd $integration_tests_dir
for ((i = 0 ; i < ${#SERVERLESS_CONFIGS[@]} ; i++)); do
    echo "Running 'sls package' with ${SERVERLESS_CONFIGS[i]}"
    serverless package --config ${SERVERLESS_CONFIGS[i]}
    cp .serverless/cloudformation-template-update-stack.json ${TEST_SNAPSHOTS[i]}
    echo "===================================="
    if [ -n "$UPDATE_SNAPSHOTS" ]; then
        echo "Overriding ${CORRECT_SNAPSHOTS[i]}"
        cp ${TEST_SNAPSHOTS[i]} ${CORRECT_SNAPSHOTS[i]}
    fi

    echo "Performing diff of ${TEST_SNAPSHOTS[i]} against ${CORRECT_SNAPSHOTS[i]}"
    set +e # Dont exit right away if there is a diff in snapshots
    # Use grep to remove fields following this regex as they are not consistent with each CFN template generation.
    diff <(grep -vE "("S3Key".*)|(.*LambdaVersion.*)|("CodeSha256".*)" ${TEST_SNAPSHOTS[i]}) <(grep -vE "("S3Key".*)|(.*LambdaVersion.*)|("CodeSha256".*)" ${CORRECT_SNAPSHOTS[i]}) 
    return_code=$?
    set -e
    if [ $return_code -eq 0 ]; then
        echo "SUCCESS: There were no differences between the ${TEST_SNAPSHOTS[i]} and ${CORRECT_SNAPSHOTS[i]}"
    else
        echo "FAILURE: There were differences between the ${TEST_SNAPSHOTS[i]} and ${CORRECT_SNAPSHOTS[i]}. Review the diff output above."
        echo "If you expected the ${TEST_SNAPSHOTS[i]} to be different, generate new snapshots using: 'UPDATE_SNAPSHOTS=true ./scripts/run_integration_tests.sh'"
        exit 1
    fi
    echo "===================================="

done

if [ -n "$UPDATE_SNAPSHOTS" ]; then
        echo "Staging and commiting new correct snapshots"
        cd $root_dir
        git add .
        git commit -m "Update correct_forwarder_snapshot.json and correct_extension_snapshot.json for snapshot integration tests"
fi
exit 0

