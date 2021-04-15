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
if [ "$UPDATE_SNAPSHOTS" = "true" ]; then
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
    if [ "$UPDATE_SNAPSHOTS" = "true" ]; then
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
        echo "If you expected the ${TEST_SNAPSHOTS[i]} to be different generate new snapshots by running this command from a development branch on your local repository: 'UPDATE_SNAPSHOTS=true ./scripts/run_integration_tests.sh'"
        exit 1
    fi
    echo "===================================="

done

if [ "$UPDATE_SNAPSHOTS" = "true" ]; then
        cd $root_dir
        BRANCH=$(git rev-parse --abbrev-ref HEAD)
        if [ $BRANCH = "master" ]; then
            echo "Error: Cannot update snapshot files directly through the master branch, please create a development branch then run the script again."
            exit 1            
        else
            echo "Commiting and pushing up snapshot changes to ${BRANCH}. Please create a pull request on GitHub."
            git add .
            git commit -m "Update snapshots for integration tests"
            git push origin $BRANCH
        fi
fi
exit 0
