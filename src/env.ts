/*
 * Unless explicitly stated otherwise all files in this repository are licensed
 * under the Apache License Version 2.0.
 *
 * This product includes software developed at Datadog (https://www.datadoghq.com/).
 * Copyright 2021 Datadog, Inc.
 */

import Service from "serverless/classes/Service";
import { ExtendedFunctionDefinition, FunctionInfo, runtimeLookup, RuntimeType } from "./layer";

export interface Configuration {
  // Whether Datadog is enabled. Defaults to true.
  enabled?: boolean;
  // Whether to add the lambda library layers, or expect the user's to bring their own
  addLayers: boolean;
  // Datadog API Key, only necessary when using metrics without log forwarding
  apiKey?: string;
  // Datadog App Key used for enabling monitor configuration through plugin; separate from the apiKey that is deployed with your function
  appKey?: string;
  // Deprecated: old DATADOG_API_KEY used to deploy monitors
  monitorsApiKey?: string;
  // Deprecated: old DATADOG_APP_KEY used to deploy monitors
  monitorsAppKey?: string;
  // The ARN of the secret in AWS Secrets Manager containing the Datadog API key.
  apiKeySecretArn?: string;
  // Datadog API Key encrypted using KMS, only necessary when using metrics without log forwarding
  apiKMSKey?: string;
  // Whether to capture and store the payload and response of a lambda invocation
  captureLambdaPayload?: boolean;
  // Which Datadog site to send to (for example, datadoghq.com or datadoghq.eu)
  site: string;
  // The subdomain to use for app url links that are printed to output. Defaults to app
  subdomain: string;
  // The log level, (set to DEBUG for extended logging)
  logLevel: string | undefined;
  // Whether the log forwarder integration is enabled by default
  flushMetricsToLogs: boolean;
  // Enable tracing on Lambda functions and API Gateway integrations using X-Ray. Defaults to true
  enableXrayTracing: boolean;
  // Enable tracing on Lambda function using dd-trace, datadog's APM library.
  enableDDTracing: boolean;
  // Enable forwarding Logs
  enableDDLogs: boolean;
  // Enable profiling
  enableProfiling?: boolean;
  // Whether to add the Datadog Lambda Extension to send data without the need of the Datadog Forwarder.
  addExtension: boolean;

  // When either is set, the plugin will subscribe the lambdas to the forwarder with the given arn.
  forwarderArn?: string;
  forwarder?: string;

  // Set this to true when you are running the Serverless Plugin's integration tests. This prevents the
  // plugin from validating the Forwarder ARN and adding Datadog Monitor output links. Defaults to false.
  integrationTesting?: boolean;

  // When set, the plugin will try to automatically tag customers' lambda functions with service and env,
  // but will not override existing tags set on function or provider levels. Defaults to true
  enableTags: boolean;
  // When set, the lambda layer will automatically patch console.log with Datadog's tracing ids.
  injectLogContext: boolean;
  // When set, the plugin will automatically tag the function with git.commit.sha and git.repository_url.
  enableSourceCodeIntegration: boolean;
  // When set, if enableSourceCodeIntegration is true, the plugin will upload git metadata to Datadog.
  // Set this to false if you have the Datadog github integration setup (as then git metadata does not
  // need to be uploaded).
  uploadGitMetadata: boolean;

  // When set, this plugin will not try to redirect the handlers of these specified functions;
  exclude: string[];
  // When set, this plugin will configure the specified monitors for the function
  monitors?: { [id: string]: { [key: string]: any } }[];

  // When set, this plugin will fail a deployment if monitors can't be created
  failOnError: boolean;
  // API Gateway Access logging
  subscribeToAccessLogs: boolean;
  // API Gateway Execution logging - handles rest and websocket. Http not supported as of Sept.21
  subscribeToExecutionLogs: boolean;
  // Step Function logging
  subscribeToStepFunctionLogs: boolean;
  // Skip populating the Cloudformation Outputs
  skipCloudformationOutputs: boolean;

  // When set, this plugin will configure the specified handler for the functions
  customHandler?: string;

  // Cold Start Tracing is enabled by default
  enableColdStartTracing?: boolean;
  // minimum duration to trace a module load span
  minColdStartTraceDuration?: number;
  // User specified list of libraries for Cold Start Tracing to ignore
  coldStartTraceSkipLibs?: string;

  // Whether to encode the tracing context in the lambda authorizer's reponse data. Default true
  encodeAuthorizerContext?: boolean;
  // Whether to parse and use the encoded tracing context from lambda authorizers. Default true
  decodeAuthorizerContext?: boolean;

  // Determine when to submit spans before a timeout occurs.
  // When the remaining time in a Lambda invocation is less than `apmFlushDeadline`, the tracer will
  // attempt to submit the current active spans and all finished spans.
  apmFlushDeadline?: string | number;

  // Whether the plugin should look for Datadog Lambda layers in the local AWS account to use
  useLocalAccountLayers?: boolean;
}
const webpackPluginName = "serverless-webpack";
const apiKeyEnvVar = "DD_API_KEY";
const apiKeyKMSEnvVar = "DD_KMS_API_KEY";
const apiKeySecretArnEnvVar = "DD_API_KEY_SECRET_ARN";
const siteURLEnvVar = "DD_SITE";
const logLevelEnvVar = "DD_LOG_LEVEL";
const logForwardingEnvVar = "DD_FLUSH_TO_LOG";
const ddTracingEnabledEnvVar = "DD_TRACE_ENABLED";
const ddMergeXrayTracesEnvVar = "DD_MERGE_XRAY_TRACES";
const logInjectionEnvVar = "DD_LOGS_INJECTION";
const ddLogsEnabledEnvVar = "DD_SERVERLESS_LOGS_ENABLED";
const ddCaptureLambdaPayloadEnvVar = "DD_CAPTURE_LAMBDA_PAYLOAD";
const ddColdStartTracingEnabledEnvVar = "DD_COLD_START_TRACING";
const ddMinColdStartDurationEnvVar = "DD_MIN_COLD_START_DURATION";
const ddColdStartTracingSkipLibsEnvVar = "DD_COLD_START_TRACE_SKIP_LIB";
const ddProfilingEnabledEnvVar = "DD_PROFILING_ENABLED";
const ddEncodeAuthorizerContextEnvVar = "DD_ENCODE_AUTHORIZER_CONTEXT";
const ddDecodeAuthorizerContextEnvVar = "DD_DECODE_AUTHORIZER_CONTEXT";
const ddApmFlushDeadlineMillisecondsEnvVar = "DD_APM_FLUSH_DEADLINE_MILLISECONDS";
const ddUseLocalAccountLayers = "DD_USE_LOCAL_ACCOUNT_LAYERS";

export const ddServiceEnvVar = "DD_SERVICE";
export const ddEnvEnvVar = "DD_ENV";
export const ddVersionEnvVar = "DD_VERSION";
export const ddTagsEnvVar = "DD_TAGS";

// The Universal instrumentation wrapper which configures several env variables.
// Currently it is only used for Java and .NET
const AWS_LAMBDA_EXEC_WRAPPER_VAR = "AWS_LAMBDA_EXEC_WRAPPER";
const AWS_LAMBDA_EXEC_WRAPPER = "/opt/datadog_wrapper";

export const defaultConfiguration: Configuration = {
  addLayers: true,
  flushMetricsToLogs: true,
  logLevel: undefined,
  site: "datadoghq.com",
  subdomain: "app",
  enableXrayTracing: false,
  enableDDTracing: true,
  addExtension: true,
  enableTags: true,
  injectLogContext: true,
  enableSourceCodeIntegration: true,
  uploadGitMetadata: true,
  exclude: [],
  integrationTesting: false,
  subscribeToAccessLogs: true,
  subscribeToExecutionLogs: false,
  subscribeToStepFunctionLogs: false,
  enableDDLogs: true,
  captureLambdaPayload: false,
  failOnError: false,
  skipCloudformationOutputs: false,
};

export function setEnvConfiguration(config: Configuration, handlers: FunctionInfo[]) {
  handlers.forEach(({ handler, type }) => {
    handler.environment ??= {};
    const environment = handler.environment as any;
    const functionName = handler.name ?? "";
    if (
      process.env.DATADOG_API_KEY !== undefined &&
      environment[apiKeyEnvVar] === undefined &&
      // Only set this from the environment if all other methods of authentication
      // are not in use. This will set DATADOG_API_KEY on the lambda from the environment
      // variable directly if they haven't set one of the below three options
      // in the configuration.
      config.apiKMSKey === undefined &&
      config.apiKey === undefined &&
      config.apiKeySecretArn === undefined
    ) {
      environment[apiKeyEnvVar] = process.env.DATADOG_API_KEY;
    }
    if (config.apiKey !== undefined && environment[apiKeyEnvVar] === undefined) {
      environment[apiKeyEnvVar] = config.apiKey;
    }
    if (config.apiKMSKey !== undefined && environment[apiKeyKMSEnvVar] === undefined) {
      environment[apiKeyKMSEnvVar] = config.apiKMSKey;
    }
    if (config.apiKeySecretArn !== undefined && environment[apiKeySecretArnEnvVar] === undefined) {
      const isNode = runtimeLookup[handler.runtime!] === RuntimeType.NODE;
      const isSendingSynchronousMetrics = !config.addExtension && !config.flushMetricsToLogs;
      if (isSendingSynchronousMetrics && isNode) {
        throw new Error(
          "`apiKeySecretArn` is not supported for Node runtimes when using Synchronous Metrics. Set DATADOG_API_KEY in your environment, or use `apiKmsKey` in the configuration.",
        );
      }
      environment[apiKeySecretArnEnvVar] = config.apiKeySecretArn;
    }
    if (environment[siteURLEnvVar] === undefined) {
      environment[siteURLEnvVar] = config.site;
    }
    if (environment[logLevelEnvVar] === undefined) {
      environment[logLevelEnvVar] = config.logLevel;
    }
    if (environment[logForwardingEnvVar] === undefined && config.addExtension === false) {
      environment[logForwardingEnvVar] = config.flushMetricsToLogs;
    }
    if (config.enableDDTracing !== undefined && environment[ddTracingEnabledEnvVar] === undefined) {
      environment[ddTracingEnabledEnvVar] = config.enableDDTracing;
    }
    if (config.enableXrayTracing !== undefined && environment[ddMergeXrayTracesEnvVar] === undefined) {
      environment[ddMergeXrayTracesEnvVar] = config.enableXrayTracing;
    }
    if (config.injectLogContext !== undefined && environment[logInjectionEnvVar] === undefined) {
      environment[logInjectionEnvVar] = config.injectLogContext;
    }
    if (config.enableDDLogs !== undefined && environment[ddLogsEnabledEnvVar] === undefined) {
      environment[ddLogsEnabledEnvVar] = config.enableDDLogs;
    }
    if (environment[ddCaptureLambdaPayloadEnvVar] === undefined) {
      environment[ddCaptureLambdaPayloadEnvVar] = config.captureLambdaPayload;
    }
    if (config.enableColdStartTracing !== undefined && environment[ddColdStartTracingEnabledEnvVar] === undefined) {
      environment[ddColdStartTracingEnabledEnvVar] = config.enableColdStartTracing;
    }
    if (config.minColdStartTraceDuration !== undefined && environment[ddMinColdStartDurationEnvVar] === undefined) {
      environment[ddMinColdStartDurationEnvVar] = config.minColdStartTraceDuration;
    }
    if (config.coldStartTraceSkipLibs !== undefined && environment[ddColdStartTracingSkipLibsEnvVar] === undefined) {
      environment[ddColdStartTracingSkipLibsEnvVar] = config.coldStartTraceSkipLibs;
    }
    if (config.enableProfiling !== undefined && environment[ddProfilingEnabledEnvVar] === undefined) {
      environment[ddProfilingEnabledEnvVar] = config.enableProfiling;
    }
    if (config.encodeAuthorizerContext !== undefined && environment[ddEncodeAuthorizerContextEnvVar] === undefined) {
      environment[ddEncodeAuthorizerContextEnvVar] = config.encodeAuthorizerContext;
    }
    if (config.decodeAuthorizerContext !== undefined && environment[ddDecodeAuthorizerContextEnvVar] === undefined) {
      environment[ddDecodeAuthorizerContextEnvVar] = config.decodeAuthorizerContext;
    }
    if (config.apmFlushDeadline !== undefined && environment[ddApmFlushDeadlineMillisecondsEnvVar] === undefined) {
      environment[ddApmFlushDeadlineMillisecondsEnvVar] = config.apmFlushDeadline;
    }
    if (config.useLocalAccountLayers !== undefined && environment[ddUseLocalAccountLayers] === undefined) {
      environment[ddUseLocalAccountLayers] = config.useLocalAccountLayers;
    }
    if (type === RuntimeType.DOTNET || type === RuntimeType.JAVA) {
      if (environment[AWS_LAMBDA_EXEC_WRAPPER_VAR] === undefined) {
        environment[AWS_LAMBDA_EXEC_WRAPPER_VAR] = AWS_LAMBDA_EXEC_WRAPPER;
      } else if (environment[AWS_LAMBDA_EXEC_WRAPPER_VAR] !== AWS_LAMBDA_EXEC_WRAPPER) {
        throwEnvVariableError("AWS_LAMBDA_EXEC_WRAPPER", AWS_LAMBDA_EXEC_WRAPPER, functionName);
      }
    }
  });
}

export function setSourceCodeIntegrationEnvVar(
  handler: ExtendedFunctionDefinition,
  gitHash: string,
  gitRemote: string,
) {
  handler.environment ??= {};
  if (handler.environment[ddTagsEnvVar] !== undefined) {
    handler.environment[ddTagsEnvVar] += `,`;
  } else {
    handler.environment[ddTagsEnvVar] = "";
  }
  handler.environment[ddTagsEnvVar] += `git.commit.sha:${gitHash},git.repository_url:${gitRemote}`;
}

function throwEnvVariableError(variable: string, value: string, functionName: string) {
  throw new Error(`Environment variable ${variable} should be set to ${value} for function ${functionName}`);
}

export function getConfig(service: Service): Configuration {
  let custom = service.custom as any;
  if (custom === undefined) {
    custom = {};
  }

  let datadog = custom.datadog as Partial<Configuration> | undefined;
  if (datadog === undefined) {
    datadog = {};
  }

  // These values are deprecated but will supersede everything if set
  if (custom?.datadog?.monitorsApiKey) {
    datadog.apiKey = custom?.datadog?.monitorsApiKey ?? datadog.apiKey;
  }

  if (custom?.datadog?.monitorsAppKey) {
    datadog.appKey = custom?.datadog?.monitorsAppKey ?? datadog.appKey;
  }

  const config: Configuration = {
    ...defaultConfiguration,
    ...datadog,
  };

  return config;
}

export function forceExcludeDepsFromWebpack(service: Service) {
  const includeModules = getPropertyFromPath(service, ["custom", "webpack", "includeModules"]);
  if (includeModules === undefined) {
    return;
  }
  let forceExclude = includeModules.forceExclude as string[] | undefined;
  if (forceExclude === undefined) {
    forceExclude = [];
    includeModules.forceExclude = forceExclude;
  }
  if (!forceExclude.includes("datadog-lambda-js")) {
    forceExclude.push("datadog-lambda-js");
  }
  if (!forceExclude.includes("dd-trace")) {
    forceExclude.push("dd-trace");
  }
}

function getPropertyFromPath(obj: any, path: string[]) {
  for (const part of path) {
    let prop = obj[part];
    if (prop === undefined || prop === true) {
      prop = {};
      obj[part] = prop;
    }
    if (prop === false) {
      return;
    }
    obj = prop;
  }
  return obj;
}

export function hasWebpackPlugin(service: Service) {
  const plugins: string[] | undefined = (service as any).plugins;
  if (plugins === undefined) {
    return false;
  }
  if (Array.isArray(plugins)) {
    // We have a normal plugin array
    return plugins.find((plugin) => plugin === webpackPluginName) !== undefined;
  }
  // We have an enhanced plugins object
  const modules: string[] | undefined = (service as any).plugins.modules;
  if (modules === undefined) {
    return false;
  }
  return modules.find((plugin) => plugin === webpackPluginName) !== undefined;
}
