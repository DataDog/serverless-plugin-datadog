#!/bin/bash

# Unless explicitly stated otherwise all files in this repository are licensed
# under the Apache License Version 2.0.
# This product includes software developed at Datadog (https://www.datadoghq.com/).
# Copyright 2019 Datadog, Inc.

# Writes layer info to easily readable json file

set -e

LAYER_NAMES=("Datadog-Node8-10" "Datadog-Node10-x" "Datadog-Node12-x" "Datadog-Python27" "Datadog-Python36" "Datadog-Python37" "Datadog-Python38")
JSON_LAYER_NAMES=("nodejs8.10" "nodejs10.x" "nodejs12.x" "python2.7" "python3.6" "python3.7" "python3.8")
AVAILABLE_REGIONS=(us-east-2 us-east-1 us-west-1 us-west-2 ap-east-1 ap-south-1 ap-northeast-2 ap-southeast-1 ap-southeast-2 ap-northeast-1 ca-central-1 eu-north-1 eu-central-1 eu-west-1 eu-west-2 eu-west-3 sa-east-1)

INPUT_JSON="{\"regions\":{}}"

for region in "${AVAILABLE_REGIONS[@]}"
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
echo "Writing to src/layers.json"
jq '.' <<< $INPUT_JSON > src/layers.json
