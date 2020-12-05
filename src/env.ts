/*
 * Unless explicitly stated otherwise all files in this repository are licensed
 * under the Apache License Version 2.0.
 *
 * This product includes software developed at Datadog (https://www.datadoghq.com/).
 * Copyright 2019 Datadog, Inc.
 */

import Service from "serverless/classes/Service";

export interface Configuration {
  // Whether to add the lambda layers, or expect the user's to bring their own
  addLayers: boolean;
  // Datadog API Key, only necessary when using metrics without log forwarding
  apiKey?: string;
  // Datadog API Key encrypted using KMS, only necessary when using metrics without log forwarding
  apiKMSKey?: string;
  // Which Site to send to, (should be datadoghq.com or datadoghq.eu)
  site: string;
  // The log level, (set to DEBUG for extended logging)
  logLevel: string;
  // Whether the log forwarder integration is enabled by default
  flushMetricsToLogs: boolean;
  // Enable tracing on Lambda functions and API Gateway integrations using X-Ray. Defaults to true
  enableXrayTracing: boolean;
  // Enable tracing on Lambda function using dd-trace, datadog's APM library.
  enableDDTracing: boolean;

  // When set, the plugin will subscribe the lambdas to the forwarder with the given arn.
  forwarder?: string;

  // When set, the plugin will try to automatically tag customers' lambda functions with service and env,
  // but will not override existing tags set on function or provider levels. Defaults to true
  enableTags: boolean;
  // When set, the lambda layer will automatically patch console.log with Datadog's tracing ids.
  injectLogContext: boolean;

  // When set, this plugin will not try to redirect the handlers of these specified functions;
  exclude: string[];
}

const apiKeyEnvVar = "DD_API_KEY";
const apiKeyKMSEnvVar = "DD_KMS_API_KEY";
const siteURLEnvVar = "DD_SITE";
const logLevelEnvVar = "DD_LOG_LEVEL";
const logForwardingEnvVar = "DD_FLUSH_TO_LOG";
const ddTracingEnabledEnvVar = "DD_TRACE_ENABLED";
const logInjectionEnvVar = "DD_LOGS_INJECTION";
const excludeEnvVar = "DD_EXCLUDED_FUNCTIONS";

export const defaultConfiguration: Configuration = {
  addLayers: true,
  flushMetricsToLogs: true,
  logLevel: "info",
  site: "datadoghq.com",
  enableXrayTracing: false,
  enableDDTracing: true,
  enableTags: true,
  injectLogContext: true,
  exclude: [],
};

export function setEnvConfiguration(config: Configuration, service: Service) {
  const provider = service.provider as any;

  if (provider.environment === undefined) {
    provider.environment = {};
  }
  const environment = provider.environment as any;
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
  if (environment[logForwardingEnvVar] === undefined) {
    environment[logForwardingEnvVar] = config.flushMetricsToLogs;
  }
  if (config.enableDDTracing !== undefined && environment[ddTracingEnabledEnvVar] === undefined) {
    environment[ddTracingEnabledEnvVar] = config.enableDDTracing;
  }

  if (config.injectLogContext !== undefined && environment[logInjectionEnvVar] === undefined) {
    environment[logInjectionEnvVar] = config.injectLogContext;
  }

  if (config.exclude !== undefined && environment[excludeEnvVar] === undefined) {
    environment[excludeEnvVar] = config.exclude;
  }
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
  return {
    ...defaultConfiguration,
    ...datadog,
  };
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
  return plugins.find((plugin) => plugin === "serverless-webpack") !== undefined;
}
