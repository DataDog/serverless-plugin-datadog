#!/bin/bash

# Unless explicitly stated otherwise all files in this repository are licensed
# under the Apache License Version 2.0.
# This product includes software developed at Datadog (https://www.datadoghq.com/).
# Copyright 2021 Datadog, Inc.

# Writes layer info to easily readable json file

# Call: ./scripts/generate_layers_json [-g]
# Opts:
#   -g: generate govcloud file

set -e

LAYER_NAMES=("Datadog-Node12-x" "Datadog-Node14-x" "Datadog-Node16-x" "Datadog-Node18-x" "Datadog-Python37" "Datadog-Python38" "Datadog-Python38-ARM" "Datadog-Python39" "Datadog-Python39-ARM" "Datadog-Python310" "Datadog-Python310-ARM" "Datadog-Extension" "Datadog-Extension-ARM" "dd-trace-dotnet" "dd-trace-java")
JSON_LAYER_NAMES=("nodejs12.x" "nodejs14.x" "nodejs16.x" "nodejs18.x" "python3.7" "python3.8" "python3.8-arm" "python3.9" "python3.9-arm" "python3.10" "python3.10-arm" "extension" "extension-arm" "dotnet" "java")
AVAILABLE_REGIONS=$(aws ec2 describe-regions | jq -r '.[] | .[] | .RegionName')

FILE_NAME="src/layers.json"

INPUT_JSON="{\"regions\":{}}"

if [ "$1" = "-g" ]; then
    FILE_NAME="src/layers-gov.json"
fi

for region in $AVAILABLE_REGIONS
do
    for ((i=0;i<${#LAYER_NAMES[@]};++i));
    do

        layer_name=${LAYER_NAMES[i]}
        json_layer_name=${JSON_LAYER_NAMES[i]}

        last_layer_arn=$(aws lambda list-layer-versions --layer-name $layer_name --region $region | jq -r ".LayerVersions | .[0] |  .LayerVersionArn | select (.!=null)")

        if [ -z $last_layer_arn ]; then
             >&2 echo "No layer found for $region, $layer_name"
        else
            echo $last_layer_arn
            INPUT_JSON=$(jq -r ".regions . \"$region\" . \"$json_layer_name\" = \"$last_layer_arn\"" <<< $INPUT_JSON)
        fi
    done
done
echo "Writing to ${FILE_NAME}"
jq '.' <<< $INPUT_JSON > $FILE_NAME
