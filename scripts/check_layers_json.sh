#!/bin/bash

# Unless explicitly stated otherwise all files in this repository are licensed
# under the Apache License Version 2.0.
# This product includes software developed at Datadog (https://www.datadoghq.com/).
# Copyright 2019 Datadog, Inc.

set -e

if [ ! -f "src/layers.json" ]
then
    echo "Layers.json not set, please make sure to run generate_layers_json.sh before building"
    exit 1
fi
