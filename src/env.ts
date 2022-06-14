/*
 * Unless explicitly stated otherwise all files in this repository are licensed
 * under the Apache License Version 2.0.
 *
 * This product includes software developed at Datadog (https://www.datadoghq.com/).
 * Copyright 2021 Datadog, Inc.
 */

import Service from "serverless/classes/Service";
import { FunctionInfo, runtimeLookup, RuntimeType } from "./layer";

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
  // Which Site to send to, (should be datadoghq.com or datadoghq.eu)
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
  // When set, the plugin will automatically upload git commit data to Datadog and tag the function with
  // git.commit.sha.
  enableSourceCodeIntegration: boolean;

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

  // When set, this plugin will configure the specified handler for the functions
  customHandler?: string;
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

export const ddServiceEnvVar = "DD_SERVICE";
export const ddEnvEnvVar = "DD_ENV";
export const ddVersionEnvVar = "DD_VERSION";
export const ddTagsEnvVar = "DD_TAGS";

// .NET tracer env variables
const ENABLE_PROFILING_ENV_VAR = "CORECLR_ENABLE_PROFILING";
const PROFILER_ENV_VAR = "CORECLR_PROFILER";
const PROFILER_PATH_ENV_VAR = "CORECLR_PROFILER_PATH";
const DOTNET_TRACER_HOME_ENV_VAR = "DD_DOTNET_TRACER_HOME";
const CORECLR_ENABLE_PROFILING = "1";
const CORECLR_PROFILER = "{846F5F1C-F9AE-4B07-969E-05C26BC060D8}";
const CORECLR_PROFILER_PATH = "/opt/datadog/Datadog.Trace.ClrProfiler.Native.so";
const DD_DOTNET_TRACER_HOME = "/opt/datadog";

// Java tracer env variables
const JAVA_TOOL_OPTIONS_VAR = "JAVA_TOOL_OPTIONS";
const JAVA_TOOL_OPTIONS = '-javaagent:"/opt/java/lib/dd-java-agent.jar" -XX:+TieredCompilation -XX:TieredStopAtLevel=1';
const JAVA_JMXFETCH_ENABLED_VAR = "DD_JMXFETCH_ENABLED";
const JAVA_JMXFETCH_ENABLED = false;
const JAVA_RUNTIME_METRICS_ENABLED_VAR = "DD_RUNTIME_METRICS_ENABLED";
const JAVA_RUNTIME_METRICS_ENABLED = false;

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
  exclude: [],
  integrationTesting: false,
  subscribeToAccessLogs: true,
  subscribeToExecutionLogs: false,
  enableDDLogs: true,
  captureLambdaPayload: false,
  failOnError: false,
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
    if (type === RuntimeType.DOTNET) {
      if (environment[ENABLE_PROFILING_ENV_VAR] === undefined) {
        environment[ENABLE_PROFILING_ENV_VAR] = CORECLR_ENABLE_PROFILING;
      } else if (environment[ENABLE_PROFILING_ENV_VAR] !== CORECLR_ENABLE_PROFILING) {
        throwEnvVariableError("CORECLR_ENABLE_PROFILING", CORECLR_ENABLE_PROFILING, functionName);
      }
      if (environment[PROFILER_ENV_VAR] === undefined) {
        environment[PROFILER_ENV_VAR] = CORECLR_PROFILER;
      } else if (environment[PROFILER_ENV_VAR] !== CORECLR_PROFILER) {
        throwEnvVariableError("CORECLR_PROFILER", CORECLR_PROFILER, functionName);
      }
      if (environment[PROFILER_PATH_ENV_VAR] === undefined) {
        environment[PROFILER_PATH_ENV_VAR] = CORECLR_PROFILER_PATH;
      } else if (environment[PROFILER_PATH_ENV_VAR] !== CORECLR_PROFILER_PATH) {
        throwEnvVariableError("CORECLR_PROFILER_PATH", CORECLR_PROFILER_PATH, functionName);
      }
      if (environment[DOTNET_TRACER_HOME_ENV_VAR] === undefined) {
        environment[DOTNET_TRACER_HOME_ENV_VAR] = DD_DOTNET_TRACER_HOME;
      } else if (environment[DOTNET_TRACER_HOME_ENV_VAR] !== DD_DOTNET_TRACER_HOME) {
        throwEnvVariableError("DD_DOTNET_TRACER_HOME", DD_DOTNET_TRACER_HOME, functionName);
      }
    }
    if (type === RuntimeType.JAVA) {
      if (environment[JAVA_TOOL_OPTIONS_VAR] === undefined) {
        environment[JAVA_TOOL_OPTIONS_VAR] = JAVA_TOOL_OPTIONS;
      } else if (environment[JAVA_TOOL_OPTIONS_VAR] !== JAVA_TOOL_OPTIONS) {
        throwEnvVariableError("JAVA_TOOL_OPTIONS", JAVA_TOOL_OPTIONS, functionName);
      }
      if (environment[JAVA_JMXFETCH_ENABLED_VAR] === undefined) {
        environment[JAVA_JMXFETCH_ENABLED_VAR] = JAVA_JMXFETCH_ENABLED;
      } else if (environment[JAVA_JMXFETCH_ENABLED_VAR] !== JAVA_JMXFETCH_ENABLED) {
        throwEnvVariableError("DD_JMXFETCH_ENABLED", `${JAVA_JMXFETCH_ENABLED}`, functionName);
      }
      if (environment[JAVA_RUNTIME_METRICS_ENABLED_VAR] === undefined) {
        environment[JAVA_RUNTIME_METRICS_ENABLED_VAR] = JAVA_RUNTIME_METRICS_ENABLED;
      } else if (environment[JAVA_RUNTIME_METRICS_ENABLED_VAR] !== JAVA_RUNTIME_METRICS_ENABLED) {
        throwEnvVariableError("DD_RUNTIME_METRICS_ENABLED", `${JAVA_RUNTIME_METRICS_ENABLED}`, functionName);
      }
    }
  });
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
