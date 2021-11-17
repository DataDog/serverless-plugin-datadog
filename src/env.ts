/*
 * Unless explicitly stated otherwise all files in this repository are licensed
 * under the Apache License Version 2.0.
 *
 * This product includes software developed at Datadog (https://www.datadoghq.com/).
 * Copyright 2021 Datadog, Inc.
 */

import { FunctionInfo } from "layer";
import Service from "serverless/classes/Service";

export interface Configuration {
  // Whether Datadog is enabled. Defaults to true.
  enabled?: boolean;
  // Whether to add the lambda library layers, or expect the user's to bring their own
  addLayers: boolean;
  // Datadog API Key, only necessary when using metrics without log forwarding
  apiKey?: string;
  // Datadog API Key encrypted using KMS, only necessary when using metrics without log forwarding
  apiKMSKey?: string;
  // Whether to capture and store the payload and response of a lambda invocation
  captureLambdaPayload?: boolean;
  // Datadog API Key used for enabling monitor and source code integration configuration through plugin
  datadogApiKey?: string;
  // Datadog App Key used for enabling monitor configuration through plugin; separate from the apiKey that is deployed with your function
  datadogAppKey?: string;
  // Which Site to send to, (should be datadoghq.com or datadoghq.eu)
  site: string;
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

  // When set, this plugin will not try to redirect the handlers of these specified functions;
  exclude: string[];
  // When set, this plugin will configure the specified monitors for the function
  monitors?: { [id: string]: { [key: string]: any } }[];

  // API Gateway Access logging
  subscribeToAccessLogs: boolean;
  // API Gateway Execution logging - handles rest and websocket. Http not supported as of Sept.21
  subscribeToExecutionLogs: boolean;

  // When set, this plugin will configure the specified handler for the functions
  customHandler?: string;
}
const webpackPluginName = "serverless-webpack";
const apiKeyEnvVar = "DD_API_KEY";
const apiKeyKMSEnvVar = "DD_KMS_API_KEY";
const siteURLEnvVar = "DD_SITE";
const logLevelEnvVar = "DD_LOG_LEVEL";
const logForwardingEnvVar = "DD_FLUSH_TO_LOG";
const ddTracingEnabledEnvVar = "DD_TRACE_ENABLED";
const logInjectionEnvVar = "DD_LOGS_INJECTION";
const ddLogsEnabledEnvVar = "DD_SERVERLESS_LOGS_ENABLED";
const ddCaptureLambdaPayloadEnvVar = "DD_CAPTURE_LAMBDA_PAYLOAD";
const ddApiKeyEnvVar = "DATADOG_API_KEY";
const ddAppKeyEnvVar = "DATADOG_APP_KEY";

export const defaultConfiguration: Configuration = {
  addLayers: true,
  flushMetricsToLogs: true,
  logLevel: undefined,
  site: "datadoghq.com",
  enableXrayTracing: false,
  enableDDTracing: true,
  addExtension: false,
  enableTags: true,
  injectLogContext: true,
  exclude: [],
  integrationTesting: false,
  subscribeToAccessLogs: true,
  subscribeToExecutionLogs: false,
  enableDDLogs: true,
  captureLambdaPayload: false,
};

export function setEnvConfiguration(config: Configuration, handlers: FunctionInfo[]) {
  handlers.forEach(({ handler }) => {
    handler.environment ??= {};
    const environment = handler.environment as any;
    if (config.apiKey !== undefined && environment[apiKeyEnvVar] === undefined) {
      environment[apiKeyEnvVar] = config.apiKey;
    }
    if (config.apiKMSKey !== undefined && environment[apiKeyKMSEnvVar] === undefined) {
      environment[apiKeyKMSEnvVar] = config.apiKMSKey;
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
    if (config.injectLogContext !== undefined && environment[logInjectionEnvVar] === undefined) {
      environment[logInjectionEnvVar] = config.injectLogContext;
    }
    if (config.enableDDLogs !== undefined && environment[ddLogsEnabledEnvVar] === undefined) {
      environment[ddLogsEnabledEnvVar] = config.enableDDLogs;
    }
    if (environment[ddCaptureLambdaPayloadEnvVar] === undefined) {
      environment[ddCaptureLambdaPayloadEnvVar] = config.captureLambdaPayload;
    }
  });
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

  if (process.env[ddApiKeyEnvVar]) {
    datadog.datadogApiKey ??= process.env[ddApiKeyEnvVar];
  }

  if (process.env[ddAppKeyEnvVar]) {
    datadog.datadogAppKey ??= process.env[ddAppKeyEnvVar];
  }

  // These values are deprecated but will supersede everything if set
  if (custom?.datadog?.monitorsApiKey) {
    datadog.datadogApiKey = custom?.datadog?.monitorsApiKey ?? datadog.datadogApiKey;
  }

  if (custom?.datadog?.monitorsAppKey) {
    datadog.datadogAppKey = custom?.datadog?.monitorsAppKey ?? datadog.datadogAppKey;
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
