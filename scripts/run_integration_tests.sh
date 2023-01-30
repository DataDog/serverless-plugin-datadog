#!/bin/bash

# Usage - run commands from repo root:
# To check if new changes to the plugin cause changes to any snapshots:
#   ./scripts/run_integration_tests.sh
# To regenerate snapshots:
#   UPDATE_SNAPSHOTS=true ./scripts/run_integration_tests.sh

set -e

# To add new tests create a new yml file in the 'integration_tests' directory, append it to the SERVERLESS_CONFIGS array as well as creating a name for the
# snapshots that will be compared in your test. Add those snapshot names to the TEST_SNAPSHOTS and CORRECT_SNAPSHOTS arrays.
# Note: Each yml config, test, and correct snapshot file should be at the same index in their own array. e.g. All the files for the forwarder test are at index 0.
#       In order for this script to work correctly these arrays should have the same amount of elements.
SERVERLESS_CONFIGS=("./serverless-forwarder.yml" "./serverless-extension.yml" "./serverless-extension-apigateway.yml")
TEST_SNAPSHOTS=("test_forwarder_snapshot.json" "test_extension_snapshot.json" "test_extension_apigateway.json")
CORRECT_SNAPSHOTS=("correct_forwarder_snapshot.json" "correct_extension_snapshot.json" "correct_extension_apigateway_snapshot.json")

script_path=${BASH_SOURCE[0]}
scripts_dir=$(dirname $script_path)
repo_dir=$(dirname $scripts_dir)
root_dir=$(pwd)
if [[ "$root_dir" =~ .*"serverless-plugin-datadog/scripts".* ]]; then
    echo "Make sure to run this script from the root $(serverless-plugin-datadog) directory, aborting"
    exit 1
fi

integration_tests_dir="$root_dir/integration_tests"
if [ "$UPDATE_SNAPSHOTS" = "true" ]; then
    echo "Overwriting snapshots in this execution"
fi

yarn
yarn build

cd $integration_tests_dir
RAW_CFN_TEMPLATE=".serverless/cloudformation-template-update-stack.json"
for ((i = 0; i < ${#SERVERLESS_CONFIGS[@]}; i++)); do
    echo "Running 'sls package' with ${SERVERLESS_CONFIGS[i]}"
    serverless package --config ${SERVERLESS_CONFIGS[i]}
    # Normalize S3Key timestamps
    perl -p -i -e 's/("serverless\/dd-sls-plugin-integration-test\/dev\/.*\/dd-sls-plugin-integration-test.zip")/"serverless\/dd-sls-plugin-integration-test\/dev\/XXXXXXXXXXXXX-XXXX-XX-XXXXX:XX:XX.XXXX\/dd-sls-plugin-integration-test.zip"/g' ${RAW_CFN_TEMPLATE}
    perl -p -i -e 's/("serverless\/dd-sls-plugin-integration-test\/dev\/.*\/custom-resources.zip")/"serverless\/dd-sls-plugin-integration-test\/dev\/XXXXXXXXXXXXX-XXXX-XX-XXXXX:XX:XX.XXXX\/custom-resources.zip"/g' ${RAW_CFN_TEMPLATE}
    # Normalize LambdaVersion ID's
    perl -p -i -e 's/(LambdaVersion.*")/LambdaVersionXXXX"/g' ${RAW_CFN_TEMPLATE}
    # Normalize SHA256 hashes
    perl -p -i -e 's/("CodeSha256":.*)/"CodeSha256": "XXXX"/g' ${RAW_CFN_TEMPLATE}
    # Normalize dd_sls_plugin version tag value
    perl -p -i -e 's/(v\d+.\d+.\d+)/vX.XX.X/g' ${RAW_CFN_TEMPLATE}
    # Normalize Datadog Layer Arn versions
    perl -p -i -e 's/(arn:aws:lambda:sa-east-1:464622532012:layer:(Datadog-(Python36|Python37|Python38|Python39|Node12-x|Node14-x|Node16-x|Node18-x|Extension)|dd-trace-(dotnet|java)):\d+)/arn:aws:lambda:sa-east-1:464622532012:layer:\2:XXX/g' ${RAW_CFN_TEMPLATE}
    # Normalize API Gateway timestamps
    perl -p -i -e 's/("ApiGatewayDeployment.*")/"ApiGatewayDeploymentxxxx"/g' ${RAW_CFN_TEMPLATE}
    # Normalize layer timestamps
    perl -p -i -e 's/("serverless\/dd-sls-plugin-integration-test\/dev\/.*\/ProviderLevelLayer.zip")/"serverless\/dd-sls-plugin-integration-test\/dev\/XXXXXXXXXXXXX-XXXX-XX-XXXXX:XX:XX.XXXX\/ProviderLevelLayer.zip"/g' ${RAW_CFN_TEMPLATE}
    perl -p -i -e 's/("serverless\/dd-sls-plugin-integration-test\/dev\/.*\/FunctionLevelLayer.zip")/"serverless\/dd-sls-plugin-integration-test\/dev\/XXXXXXXXXXXXX-XXXX-XX-XXXXX:XX:XX.XXXX\/FunctionLevelLayer.zip"/g' ${RAW_CFN_TEMPLATE}
    cp ${RAW_CFN_TEMPLATE} ${TEST_SNAPSHOTS[i]}
    echo "===================================="
    if [ "$UPDATE_SNAPSHOTS" = "true" ]; then
        echo "Overriding ${CORRECT_SNAPSHOTS[i]}"
        cp ${TEST_SNAPSHOTS[i]} ${CORRECT_SNAPSHOTS[i]}
    fi

    echo "Performing diff of ${TEST_SNAPSHOTS[i]} against ${CORRECT_SNAPSHOTS[i]}"
    set +e # Dont exit right away if there is a diff in snapshots
    cd ..
    python $scripts_dir/compare_snapshots.py $integration_tests_dir/${TEST_SNAPSHOTS[i]} $integration_tests_dir/${CORRECT_SNAPSHOTS[i]}
    return_code=$?
    set -e
    if [ $return_code -eq 0 ]; then
        echo "SUCCESS: There were no differences between the ${TEST_SNAPSHOTS[i]} and ${CORRECT_SNAPSHOTS[i]}"
    else
        echo "FAILURE: There were differences between the ${TEST_SNAPSHOTS[i]} and ${CORRECT_SNAPSHOTS[i]}. Review the diff output above."
        echo "If you expected the ${TEST_SNAPSHOTS[i]} to be different generate new snapshots by running this command from a development branch on your local repository: 'UPDATE_SNAPSHOTS=true ./scripts/run_integration_tests.sh'"
        exit 1
    fi
    cd $integration_tests_dir
    echo "===================================="
done
exit 0
