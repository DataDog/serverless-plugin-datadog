# Datadog Serverless Plugin

[![serverless](http://public.serverless.com/badges/v1.svg)](https://www.serverless.com)
![build](https://github.com/DataDog/serverless-plugin-datadog/workflows/build/badge.svg)
[![Code Coverage](https://img.shields.io/codecov/c/github/DataDog/serverless-plugin-datadog)](https://codecov.io/gh/DataDog/serverless-plugin-datadog)
[![NPM](https://img.shields.io/npm/v/serverless-plugin-datadog)](https://www.npmjs.com/package/serverless-plugin-datadog)
[![Slack](https://img.shields.io/badge/slack-%23serverless-blueviolet?logo=slack)](https://datadoghq.slack.com/channels/serverless/)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](https://github.com/DataDog/serverless-plugin-datadog/blob/master/LICENSE)

Datadog recommends the Serverless Framework Plugin for developers using the Serverless Framework to deploy their serverless applications.
The plugin automatically configures ingestion of metrics, traces, and logs from your serverless applications by:

- Installing and configuring the Datadog Lambda library for your Python and Node.js Lambda functions.
- Enabling the collection of enhanced Lambda metrics and custom metrics from your Lambda functions.
- Managing subscriptions from the Datadog Forwarder to your Lambda function log groups.

## Getting started

To quickly get started, follow the installation instructions for [Python][1] or [Node.js][2], and view your function's enhanced metrics, traces, and logs in Datadog. These instructions will get you a basic working setup.

## More configuration options

To further configure your plugin, use the following custom parameters in your `serverless.yml`:

| Parameter            | Description                                                                                                                                                                                                                                                                                                                                                                                     |
|----------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `flushMetricsToLogs` | Send custom metrics by using logs with the Datadog Forwarder Lambda function (recommended). Defaults to `true`. If you disable this parameter, it's required to set the parameters `site` and `apiKey` (or `apiKMSKey` if encrypted).                                                                                                                                                            |
| `site`               | Set which Datadog site to send data, only needed when flushMetricsToLogs is `false`. Defaults to `datadoghq.com`. Set to `datadoghq.eu` for the Datadog EU site.                                                                                                                                                                                                                                |
| `apiKey`             | Datadog API Key, only needed when `flushMetricsToLogs` is `false`. For more information about getting a Datadog API key, see the [API key documentation][3].                                                                                                                                                                                                                                    |
| `apiKMSKey`          | Datadog API Key encrypted using KMS. Use this parameter in place of `apiKey` when `flushMetricsToLogs` is `false`, and you are using KMS encryption.                                                                                                                                                                                                                                             |
| `addLayers`          | Whether to install the Datadog Lambda library as a layer. Defaults to `true`. Set to `false` when you plan to package the Datadog Lambda library to your function's deployment package on your own so that you can install a specific version of the Datadog Lambda library ([Python][4] or [Node.js][5]). |
| `logLevel`           | The log level, set to `DEBUG` for extended logging. Defaults to `info`.                                                                                                                                                                                                                                                                                                                           |
| `enableXrayTracing`  | Set `true` to enable X-Ray tracing on the Lambda functions and API Gateway integrations. Defaults to `false`.                                                                                                                                                                                                                                                                                   |
| `enableDDTracing`    | Enable Datadog tracing on the Lambda function. Defaults to `true`. When enabled, it's required to set the `forwarder` parameter.                                                                                                                                                                                                                                                                         |
| `forwarder`          | Setting this parameter subscribes the Lambda functions' CloudWatch log groups to the given Datadog forwarder Lambda function. Required when `enableDDTracing` is set to `true`.                                                                                                                                                                                                                 |
| `enableTags`         | When set, automatically tag the Lambda functions with the `service` and `env` tags using the `service` and `stage` values from the serverless application definition. It does NOT override if a `service` or `env` tag already exists. Defaults to `true`.                                                                                                                                      |
| `injectLogContext`         | When set, the lambda layer will automatically patch console.log with Datadog's tracing ids. Defaults to `true`.                                                                                                                                      |
| `exclude`         | When set, this plugin will ignore all specified functions. Use this parameter if you have any functions that should not include Datadog functionality. Defaults to `[]`.                                                                                                                                      |
| `enabled`            | When set to false, the DataDog plugin will stay inactive. Defaults to `true`. You can control this option using an environment variable, e.g. `enabled: ${strToBool(${env:DD_PLUGIN_ENABLED, true})}`, to activate/deactivate the plugin during deployment. Alernatively, you can also use the value passed in through `--stage` to control this option, [see example.](#disable-plugin-for-particular-environment)|


To use any of these parameters, add a `custom` > `datadog` section to your `serverless.yml` similar to this example:

```yaml
custom:
  datadog:
    flushMetricsToLogs: true
    apiKey: "{Datadog_API_Key}"
    apiKMSKey: "{Encripted_Datadog_API_Key}"
    addLayers: true
    logLevel: "info"
    enableXrayTracing: false
    enableDDTracing: true
    forwarder: arn:aws:lambda:us-east-1:000000000000:function:datadog-forwarder
    enableTags: true
    injectLogContext: true
    exclude: 
      - dd-excluded-function
```

**Note**: If you use webpack, Datadog recommends using the prebuilt layers by setting `addLayers` to `true`, which is the default, and add `datadog-lambda-js` and `dd-trace` to the [externals][6] section of your webpack config.

### TypeScript

If you are using serverless-typescript, make sure that `serverless-datadog` is above the `serverless-typescript` entry in your `serverless.yml`. The plugin will automatically detect `.ts` files.

```yaml
plugins:
  - serverless-plugin-datadog
  - serverless-typescript
```

If you use TypeScript, you may encounter the error of missing type definitions. A missing type definition happens when you use the prebuilt layers (for example, set `addLayers` to `true`, which is the default) and need to import helper functions from the `datadog-lambda-js` and `dd-trace` packages to submit custom metrics or instrument a specific function. To resolve the error, add `datadog-lambda-js` and `dd-trace` to the `devDependencies` list of your project's package.json.

### Webpack

`dd-trace` is known to be not compatible with webpack due to the use of conditional import and other issues. If using webpack, make sure to mark `datadog-lambda-js` and `dd-trace` as [externals](https://webpack.js.org/configuration/externals/) for webpack, so webpack knows these dependencies will be available in the runtime. You should also remove `datadog-lambda-js` and `dd-trace` from `package.json` and the build process to ensure you're using the versions provided by the Datadog Lambda Layer.

#### serverless-webpack

If using `serverless-webpack`, make sure to also exclude `datadog-lambda-js` and `dd-trace` in your `serverless.yml` in addition to declaring them as external in your webpack config file.

**webpack.config.js**
```javascript
var nodeExternals = require('webpack-node-externals')

module.exports = {
  // we use webpack-node-externals to excludes all node deps.
  // You can manually set the externals too.
  externals: [nodeExternals(), 'dd-trace', 'datadog-lambda-js'],
}
```

**serverless.yml**
```yaml
custom:
  webpack:
    includeModules:
      forceExclude:
        - dd-trace
        - datadog-lambda-js
```

### Forwarder

The [Datadog Forwarder Lambda function][7] needs to be installed and subscribed to your Lambda functions' log groups. The plugin automatically creates the log subscriptions when the Forwarder's ARN is supplied via the `forwarder` option.

If you run into the following error, double check the supplied Forwarder ARN is correct and ensure it is from the same region and account where your serverless application is deployed.

```
An error occurred: GetaccountapiLogGroupSubscription - Could not execute the lambda function. Make sure you have given CloudWatch Logs permission to execute your function. (Service: AWSLogs; Status Code: 400; Error Code: InvalidParameterException).
```

### Disable Plugin for Particular Environment

If you'd like to turn off the plugin based on the environment (passed via `--stage`), you can use something similar to the example below.

```yaml
provider:
  stage: ${self:opt.stage, 'dev'}

custom:
  staged: ${self:custom.stageVars.${self:provider.stage}, {}}

  stageVars:
    dev:
      dd_enabled: false

  datadog:
    enabled: ${self:custom.staged.dd_enabled, true}
```

## Opening Issues

If you encounter a bug with this package, let us know by filing an issue! Before opening a new issue, please search the existing issues to avoid duplicates.

When opening an issue, include your Serverless Framework version, Python/Node.js version, and stack trace if available. Also, please include the steps to reproduce when appropriate.

You can also open an issue for a feature request.

## Contributing

If you find an issue with this package and have a fix, please feel free to open a pull request following the [procedures](CONTRIBUTING.md).

## License

Unless explicitly stated otherwise, all files in this repository are licensed under the Apache License Version 2.0.

This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2019 Datadog, Inc.

[1]: https://docs.datadoghq.com/serverless/installation/python/?tab=serverlessframework
[2]: https://docs.datadoghq.com/serverless/installation/nodejs/?tab=serverlessframework
[3]: https://docs.datadoghq.com/account_management/api-app-keys/#api-keys
[4]: https://pypi.org/project/datadog-lambda/
[5]: https://www.npmjs.com/package/datadog-lambda-js
[6]: https://webpack.js.org/configuration/externals/
[7]: https://docs.datadoghq.com/serverless/forwarder/
