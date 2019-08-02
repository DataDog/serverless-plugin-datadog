# serverless-plugin-datadog

[![serverless](http://public.serverless.com/badges/v1.svg)](https://www.serverless.com)
[![CircleCI](https://img.shields.io/circleci/build/github/DataDog/serverless-plugin-datadog)](https://circleci.com/gh/DataDog/serverless-plugin-datadog)
[![Code Coverage](https://img.shields.io/codecov/c/github/DataDog/serverless-plugin-datadog)](https://codecov.io/gh/DataDog/serverless-plugin-datadog)
[![NPM](https://img.shields.io/npm/v/serverless-plugin-datadog)](https://www.npmjs.com/package/serverless-plugin-datadog)
[![Slack](https://img.shields.io/badge/slack-%23serverless-blueviolet?logo=slack)](https://datadoghq.slack.com/channels/serverless/)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/DataDog/serverless-plugin-datadog/blob/master/LICENSE)

This serverless framework plugin automatically instruments your Python and NodeJS lambda functions with Datadog's lambda integration for python and node.js. You can use this function to collect traces, and custom metrics.

## Installation

You can install the package library locally with one of the following commands. Keep in mind, you will need to bundle this package with your function manually.

```bash
yarn add serverless-plugin-datadog # Yarn users
npm install serverless-plugin-datadog # NPM users
```

Then in your serverless.yml add the following:

```yml
plugins:
  - serverless-plugin-datadog
```

## How it works

This plugin attaches the Datadog lambda layers/client libraries for [node](https://github.com/DataDog/datadog-lambda-layer-js) and [python](https://github.com/DataDog/datadog-lambda-layer-python) to your functions. At deploy time it generates new handler functions that wrap your existing functions and initializes the lambda layers.

## Configurations

You can configure the library by add the following section to your serverless.yml .

```yaml
custom:
  datadog:
    # Add one of the following variables to override it's default

    # Whether to add the lambda layers, or expect the user's to bring their own
    addLayers: true

    # Datadog API Key, only necessary when using metrics without log forwarding
    apiKey: ""

    # Datadog API Key encrypted using KMS, only necessary when using metrics without log forwarding
    apiKMSKey: ""

    # Which Site to send to, (should be datadoghq.com or datadoghq.eu)
    site: datadoghq.com

    # The log level, (set to DEBUG for extended logging)
    logLevel: "info"

    # Whether the log forwarder integration is enabled by default
    flushMetricsToLogs: false
```

## FAQ

### What if I want to provide my own version of dd-lambda-layer-js or dd-lambda-layer-python?

You can use your own version of those libraries by setting 'addLayers' to false in the datadog configuration block. Just make sure to bundle those libaries with your lambda.

##
