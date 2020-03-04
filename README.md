# Datadog Serverless Plugin

[![serverless](http://public.serverless.com/badges/v1.svg)](https://www.serverless.com)
[![CircleCI](https://img.shields.io/circleci/build/github/DataDog/serverless-plugin-datadog)](https://circleci.com/gh/DataDog/serverless-plugin-datadog)
[![Code Coverage](https://img.shields.io/codecov/c/github/DataDog/serverless-plugin-datadog)](https://codecov.io/gh/DataDog/serverless-plugin-datadog)
[![NPM](https://img.shields.io/npm/v/serverless-plugin-datadog)](https://www.npmjs.com/package/serverless-plugin-datadog)
[![Slack](https://img.shields.io/badge/slack-%23serverless-blueviolet?logo=slack)](https://datadoghq.slack.com/channels/serverless/)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/DataDog/serverless-plugin-datadog/blob/master/LICENSE)

This serverless framework plugin automatically instruments your Python and NodeJS Lambda functions with Datadog's native Lambda Layers. You can use this function to collect traces, and custom metrics.

## Installation

You can install the plugin with one of the following commands. Keep in mind, you will need to bundle this package with your function manually.

```bash
yarn add --dev serverless-plugin-datadog         # Yarn users
npm install --save-dev serverless-plugin-datadog # NPM users
```

Then in your serverless.yml add the following:

```yml
plugins:
  - serverless-plugin-datadog
```

## How it works

This plugin attaches the Datadog Lambda Layers for [Node.js](https://github.com/DataDog/datadog-lambda-layer-js) and [Python](https://github.com/DataDog/datadog-lambda-layer-python) to your functions. At deploy time, it generates new handler functions that wrap your existing functions and initializes the Lambda Layers.

## Configurations

You can configure the library by add the following section to your `serverless.yml`:

[Datadog Forwarder](https://docs.datadoghq.com/integrations/amazon_lambda/?tab=python#log-collection)


```yaml
custom:
  datadog:
    # Add one of the following variables to override it's default

    # Whether to add the Lambda Layers, or expect the user to bring their own. Defaults to true
    addLayers: true

    # Which Datadog Site to send data to, (should be datadoghq.com or datadoghq.eu). Defaults to datadoghq.com
    site: datadoghq.com

    # The log level, set to DEBUG for extended logging. Defaults to info
    logLevel: "info"

    # Send custom metrics via logs with the help of Datadog Forwarder Lambda function (recommended). Defaults to false
    flushMetricsToLogs: true

    # Datadog API Key, only needed when flushMetricsToLogs is false
    apiKey: ""

    # Datadog API Key encrypted using KMS, only needed when flushMetricsToLogs is false
    apiKMSKey: ""
```

## FAQ

### What if I want to provide my own version of `datadog-lambda-layer-js` or `datadog-lambda-layer-python`?

You can use your own version of those libraries by setting 'addLayers' to false in the datadog configuration block. Just make sure to bundle those libaries with your Lambda functions.

### How do I use this with serverless-webpack?

Make sure serverless-datadog is above the serverless-webpack entry in your serverless.yml

```yaml
plugins:
  - serverless-plugin-datadog
  - serverless-webpack
```

When using serverless webpack, the plugin will assume you are using es6 module format. If that's not the case, you can manually configure `nodeModuleType`.

```yaml
custom:
  datadog:
    nodeModuleType: "node" # 'typescript' | 'es6'
```

If you have the addLayers option enabled, you may also want to add 'datadog-lambda-js' and 'dd-trace' to the [externals](https://webpack.js.org/configuration/externals/) section of your webpack config.

### How do I use this with serverless-typescript?

Make sure serverless-datadog is above the serverless-typescript entry in your serverless.yml. The plugin will detect automatically .ts files.

```yaml
plugins:
  - serverless-plugin-datadog
  - serverless-typescript
```

## Opening Issues

If you encounter a bug with this package, we want to hear about it. Before opening a new issue, search the existing issues to avoid duplicates.

When opening an issue, include your Serverless Framework version, Python/Node.js version, and stack trace if available. In addition, include the steps to reproduce when appropriate.

You can also open an issue for a feature request.

## Contributing

If you find an issue with this package and have a fix, please feel free to open a pull request following the [procedures](CONTRIBUTING.md).

## License

Unless explicitly stated otherwise all files in this repository are licensed under the Apache License Version 2.0.

This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2019 Datadog, Inc.
