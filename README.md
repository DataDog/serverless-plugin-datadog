# Datadog Serverless Plugin

[![serverless](http://public.serverless.com/badges/v1.svg)](https://www.serverless.com)
[![CircleCI](https://img.shields.io/circleci/build/github/DataDog/serverless-plugin-datadog)](https://circleci.com/gh/DataDog/serverless-plugin-datadog)
[![Code Coverage](https://img.shields.io/codecov/c/github/DataDog/serverless-plugin-datadog)](https://codecov.io/gh/DataDog/serverless-plugin-datadog)
[![NPM](https://img.shields.io/npm/v/serverless-plugin-datadog)](https://www.npmjs.com/package/serverless-plugin-datadog)
[![Slack](https://img.shields.io/badge/slack-%23serverless-blueviolet?logo=slack)](https://datadoghq.slack.com/channels/serverless/)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/DataDog/serverless-plugin-datadog/blob/master/LICENSE)

The Datadog serverless framework plugin automatically installs the Datadog Lambda library to your Python and Node.js Lambda functions, and enables the collection of enhanced Lambda metrics, custom metrics, traces, and logs from your Lambda functions.

## Installation

Follow the installation instructions for [Python](https://docs.datadoghq.com/serverless/installation/python/?tab=serverlessframework) or [Node.js](https://docs.datadoghq.com/serverless/installation/nodejs/?tab=serverlessframework), and view your function's enhanced metrics, traces and logs in Datadog.

## Configuration

You can configure the plugin by adding the following section to your `serverless.yml`:

```yaml
custom:
  datadog:
    # Send custom metrics via logs with the help of Datadog Forwarder Lambda function (recommended). Defaults to `false`.
    # When disabled, the parameter `site` and `apiKey` (or `apiKMSKey` if encrypted) must be set.
    flushMetricsToLogs: false

    # Which Datadog Site to send data to, only needed when flushMetricsToLogs is `false`. Defaults to `datadoghq.com`.
    # Set to `datadoghq.eu` for Datadog EU.
    site: datadoghq.com

    # Datadog API Key, only needed when flushMetricsToLogs is false.
    apiKey: ""

    # Datadog API Key encrypted using KMS, only needed when flushMetricsToLogs is false.
    apiKMSKey: ""
    
    # Whether to install the Datadog Lambda library as a layer. Defaults to `true`.
    # Set to `false` when you plan to package the Datadog Lambda library to your function's deployment package on your own.
    addLayers: true

    # The log level, set to DEBUG for extended logging. Defaults to `info`.
    logLevel: "info"

    # Enable X-Ray tracing on the Lambda functions and API Gateway integrations. Defaults to `false`.
    enableXrayTracing: false

    # Enable Datadog tracing on the Lambda function. Defaults to `true`.
    # When enabled, the parameter `forwarder` must be set.
    enableDDTracing: true

    # When set, automatically subscribe the Lambda functions' CloudWatch log groups to the given Datadog forwarder Lambda function.
    forwarder: arn:aws:lambda:us-east-1:000000000000:function:datadog-forwarder

    # When set, automatically tag the Lambda functions with the `service` and `env` tags using the `service` and `stage` values from the serverless application definition. It does NOT override if a `service` or `env` tag already exists. Defaults to `true`.
    enableTags: true
```

## FAQ

### What if I need to install a specific version of the Datadog Lambda library?

Set `addLayers` to false, and then you can install and package a specific version of the Datadog Lambda library ([Python](https://pypi.org/project/datadog-lambda/) or [Node.js](https://www.npmjs.com/package/datadog-lambda-js)) on your own.

### What if I use TypeScript?

You may encounter the error of missing type definitions if you use the prebuilt layers (i.e., set `addLayers` to `true`, which is the default) and need to import helper functions from the `datadog-lambda-js` and `dd-trace` packages to submit custom metrics or instrument a specific function. To resolve the error, add `datadog-lambda-js` and `dd-trace` to the `devDependencies` list of your project's package.json.

### How do I use this with serverless-typescript?

Make sure serverless-datadog is above the serverless-typescript entry in your serverless.yml. The plugin will detect automatically .ts files.

```yaml
plugins:
  - serverless-plugin-datadog
  - serverless-typescript
```

### What if I use webpack?

You are recommended to use the prebuilt layers (i.e., set `addLayers` to `true`, which is the default), and add `datadog-lambda-js` and `dd-trace` to the [externals](https://webpack.js.org/configuration/externals/) section of your webpack config.

## Opening Issues

If you encounter a bug with this package, we want to hear about it. Before opening a new issue, search the existing issues to avoid duplicates.

When opening an issue, include your Serverless Framework version, Python/Node.js version, and stack trace if available. In addition, include the steps to reproduce when appropriate.

You can also open an issue for a feature request.

## Contributing

If you find an issue with this package and have a fix, please feel free to open a pull request following the [procedures](CONTRIBUTING.md).

## License

Unless explicitly stated otherwise all files in this repository are licensed under the Apache License Version 2.0.

This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2019 Datadog, Inc.
