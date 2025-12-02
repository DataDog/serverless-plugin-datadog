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

LAYER_NAMES=(
    "Datadog-Node16-x"
    "Datadog-Node18-x"
    "Datadog-Node20-x"
    "Datadog-Node22-x"
    "Datadog-Node24-x"
    "Datadog-Python37"
    "Datadog-Python38"
    "Datadog-Python38-ARM"
    "Datadog-Python39"
    "Datadog-Python39-ARM"
    "Datadog-Python310"
    "Datadog-Python310-ARM"
    "Datadog-Python311"
    "Datadog-Python311-ARM"
    "Datadog-Python312"
    "Datadog-Python312-ARM"
    "Datadog-Python313"
    "Datadog-Python313-ARM"
    "Datadog-Python314"
    "Datadog-Python314-ARM"
    "Datadog-Ruby3-2"
    "Datadog-Ruby3-2-ARM"
    "Datadog-Ruby3-3"
    "Datadog-Ruby3-3-ARM"
    "Datadog-Extension"
    "Datadog-Extension-ARM"
    "Datadog-Extension-FIPS"
    "Datadog-Extension-ARM-FIPS"
    "dd-trace-dotnet"
    "dd-trace-dotnet-ARM"
    "dd-trace-java"
)

JSON_LAYER_NAMES=(
    "nodejs16.x"
    "nodejs18.x"
    "nodejs20.x"
    "nodejs22.x"
    "nodejs24.x"
    "python3.7"
    "python3.8"
    "python3.8-arm"
    "python3.9"
    "python3.9-arm"
    "python3.10"
    "python3.10-arm"
    "python3.11"
    "python3.11-arm"
    "python3.12"
    "python3.12-arm"
    "python3.13"
    "python3.13-arm"
    "python3.14"
    "python3.14-arm"
    "ruby3.2"
    "ruby3.2-arm"
    "ruby3.3"
    "ruby3.3-arm"
    "extension"
    "extension-arm"
    "extension-fips"
    "extension-arm-fips"
    "dotnet"
    "dotnet-arm"
    "java"
)

AVAILABLE_REGIONS=$(aws ec2 describe-regions | jq -r '.[] | .[] | .RegionName')

FILE_NAME="src/layers.json"

INPUT_JSON="{\"regions\":{}}"

if [ "$1" = "-g" ]; then
    FILE_NAME="src/layers-gov.json"
fi

# Fetch the layers for each region in parallel
echo "Fetching layers for each region"
rm -rf layers
mkdir layers
for region in $AVAILABLE_REGIONS; do
  {
    aws lambda list-layers --region "$region" | jq -c '[.Layers[] | {LayerName, LastLayerArn: .LatestMatchingVersion.LayerVersionArn}]' > layers/$region.json
  } &
done
wait # Wait for all parallel jobs to complete

echo "Generating layers json"
for region in $AVAILABLE_REGIONS
do
    for ((i=0;i<${#LAYER_NAMES[@]};++i));
    do

        layer_name=${LAYER_NAMES[i]}
        json_layer_name=${JSON_LAYER_NAMES[i]}

        last_layer_arn=$(cat layers/$region.json | jq -r --arg layer_name $layer_name '.[] | select(.LayerName == $layer_name) .LastLayerArn')

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

rm -rf layers
