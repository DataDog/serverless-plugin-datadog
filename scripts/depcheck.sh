#!/bin/bash

DEPCHECK_OUTPUT=`depcheck`

if [[ `echo $DEPCHECK_OUTPUT | grep Missing | wc -l` -gt 0 ]]; then
    echo "Found some missing dependencies."
    echo "$DEPCHECK_OUTPUT"
    exit 1
    echo "`yarn add` the missing dependencies and re-commit package.json."
else
    echo "Dependencies look good!"
fi
