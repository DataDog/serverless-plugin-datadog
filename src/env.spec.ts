/*
 * Unless explicitly stated otherwise all files in this repository are licensed
 * under the Apache License Version 2.0.
 *
 * This product includes software developed at Datadog (https://www.datadoghq.com/).
 * Copyright 2021 Datadog, Inc.
 */

import {
  ddTagsEnvVar,
  defaultConfiguration,
  forceExcludeDepsFromWebpack,
  getConfig,
  hasWebpackPlugin,
  setEnvConfiguration,
  setSourceCodeIntegrationEnvVar,
} from "./env";
import { ExtendedFunctionDefinition, FunctionInfo, RuntimeType } from "./layer";

describe("addSourceCodeIntegration", () => {
  it("does not overwrite DD_TAGS when DD_TAGS are already set", () => {
    let handler = {
      events: [],
      environment: {
        DD_TAGS: "sample_tag:sample_val",
      },
    } as ExtendedFunctionDefinition;
    setSourceCodeIntegrationEnvVar(handler, "1234");
    expect(handler.environment![ddTagsEnvVar]).toEqual("sample_tag:sample_val,git.commit.sha:1234");
  });

  it("sets git.commit.sha when no DD_TAGS are found in the environment", () => {
    let handler = {
      events: [],
      environment: {
        SOME_KEY: "some_val",
      },
    } as ExtendedFunctionDefinition;
    setSourceCodeIntegrationEnvVar(handler, "1234");
    expect(handler.environment![ddTagsEnvVar]).toEqual("git.commit.sha:1234");
  });
});

describe("hasWebpackPlugin", () => {
  it("returns false when the serverless.yml plugins object is not defined", () => {
    const service = {
      plugins: undefined,
    } as any;
    const result = hasWebpackPlugin(service);
    expect(result).toBe(false);
  });

  it("returns false when the serverless.yml plugins object does not define the serverless-webpack plugin", () => {
    const service = {
      plugins: ["serverless-plugin-datadog"],
    } as any;
    const result = hasWebpackPlugin(service);
    expect(result).toBe(false);
  });

  it("returns true when the serverless.yml plugins object does define the serverless-webpack plugin", () => {
    const service = {
      plugins: ["serverless-plugin-datadog", "serverless-webpack"],
    } as any;
    const result = hasWebpackPlugin(service);
    expect(result).toBe(true);
  });

  it("returns false when the serverless.yml enhanced plugins object does not define the serverless-webpack plugin", () => {
    const service = {
      plugins: {
        localPath: "",
        modules: ["serverless-plugin-datadog"],
      },
    } as any;
    const result = hasWebpackPlugin(service);
    expect(result).toBe(false);
  });

  it("returns true when the serverless.yml enhanced plugins object does define the serverless-webpack plugin", () => {
    const service = {
      plugins: {
        localPath: "",
        modules: ["serverless-plugin-datadog", "serverless-webpack"],
      },
    } as any;
    const result = hasWebpackPlugin(service);
    expect(result).toBe(true);
  });
});

describe("getConfig", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = {};
  });
  it("get a default configuration when none is present", () => {
    const result = getConfig({ custom: {} } as any);
    expect(result).toEqual(defaultConfiguration);
  });

  it("uses configuration api and app keys over environment variables", () => {
    process.env.DATADOG_API_KEY = "api-key";
    process.env.DATADOG_APP_KEY = "app-key";

    const result = getConfig({
      custom: {
        datadog: {
          apiKey: "use-this-api-key",
          appKey: "use-this-app-key",
        },
      },
    } as any);

    expect(result).toEqual({
      apiKey: "use-this-api-key",
      appKey: "use-this-app-key",
      ...defaultConfiguration,
    });
  });

  it("uses monitor api and app keys over everything else", () => {
    process.env.DATADOG_API_KEY = "api-key";
    process.env.DATADOG_APP_KEY = "app-key";

    const result = getConfig({
      custom: {
        datadog: {
          monitorsApiKey: "monitors-api-key",
          monitorsAppKey: "monitors-app-key",
          apiKey: "use-this-api-key",
          appKey: "use-this-app-key",
        },
      },
    } as any);

    expect(result).toEqual({
      apiKey: "monitors-api-key",
      appKey: "monitors-app-key",
      monitorsApiKey: "monitors-api-key",
      monitorsAppKey: "monitors-app-key",
      ...defaultConfiguration,
    });
  });

  it("uses apiKey instead of DATADOG_API_KEY", () => {
    process.env.DATADOG_API_KEY = "api-key";

    const result = getConfig({
      custom: {
        datadog: {
          apiKey: "use-this-api-key",
        },
      },
    } as any);

    expect(result).toEqual({
      apiKey: "use-this-api-key",
      ...defaultConfiguration,
    });
  });

  it("gets a mixed configuration when some values are present", () => {
    const result = getConfig({
      custom: {
        datadog: {
          apiKey: "1234",
          logLevel: "debug",
        },
      },
    } as any);
    expect(result).toEqual({
      addLayers: true,
      apiKey: "1234",
      flushMetricsToLogs: true,
      logLevel: "debug",
      captureLambdaPayload: false,
      site: "datadoghq.com",
      subdomain: "app",
      enableXrayTracing: false,
      enableDDTracing: true,
      enableDDLogs: true,
      addExtension: true,
      enableTags: true,
      injectLogContext: true,
      exclude: [],
      integrationTesting: false,
      subscribeToAccessLogs: true,
      subscribeToExecutionLogs: false,
      enableSourceCodeIntegration: true,
      failOnError: false,
    });
  });

  it("sets addExtension to true", () => {
    const result = getConfig({
      custom: {
        datadog: {
          apiKey: "1234",
          logLevel: "debug",
          addExtension: true,
        },
      },
    } as any);
    expect(result).toEqual({
      addLayers: true,
      apiKey: "1234",
      flushMetricsToLogs: true,
      logLevel: "debug",
      captureLambdaPayload: false,
      site: "datadoghq.com",
      subdomain: "app",
      enableXrayTracing: false,
      enableDDTracing: true,
      enableDDLogs: true,
      addExtension: true,
      enableTags: true,
      injectLogContext: true,
      exclude: [],
      integrationTesting: false,
      subscribeToAccessLogs: true,
      subscribeToExecutionLogs: false,
      enableSourceCodeIntegration: true,
      failOnError: false,
    });
  });

  it("sets custom handler", () => {
    const result = getConfig({
      custom: {
        datadog: {
          apiKey: "1234",
          logLevel: "debug",
          customHandler: "/src/custom-handler.handler",
        },
      },
    } as any);
    expect(result).toEqual({
      addLayers: true,
      apiKey: "1234",
      captureLambdaPayload: false,
      flushMetricsToLogs: true,
      logLevel: "debug",
      site: "datadoghq.com",
      subdomain: "app",
      enableXrayTracing: false,
      enableDDTracing: true,
      enableDDLogs: true,
      addExtension: true,
      enableTags: true,
      injectLogContext: true,
      exclude: [],
      integrationTesting: false,
      subscribeToAccessLogs: true,
      subscribeToExecutionLogs: false,
      customHandler: "/src/custom-handler.handler",
      enableSourceCodeIntegration: true,
      failOnError: false,
    });
  });
});

it("disable source code integration", () => {
  const result = getConfig({
    custom: {
      datadog: {
        apiKey: "1234",
        logLevel: "debug",
        enableSourceCodeIntegration: false,
      },
    },
  } as any);
  expect(result).toEqual({
    addLayers: true,
    apiKey: "1234",
    captureLambdaPayload: false,
    flushMetricsToLogs: true,
    logLevel: "debug",
    site: "datadoghq.com",
    subdomain: "app",
    enableXrayTracing: false,
    enableDDTracing: true,
    enableDDLogs: true,
    addExtension: true,
    enableTags: true,
    injectLogContext: true,
    exclude: [],
    integrationTesting: false,
    subscribeToAccessLogs: true,
    subscribeToExecutionLogs: false,
    enableSourceCodeIntegration: false,
    failOnError: false,
  });
});

describe("forceExcludeDepsFromWebpack", () => {
  it("adds missing fields to the webpack config", () => {
    const service = {} as any;
    forceExcludeDepsFromWebpack(service);
    expect(service).toEqual({
      custom: {
        webpack: {
          includeModules: {
            forceExclude: ["datadog-lambda-js", "dd-trace"],
          },
        },
      },
    });
  });
  it("replaces includeModules:true", () => {
    const service = {
      custom: {
        webpack: {
          includeModules: true,
        },
      },
    } as any;
    forceExcludeDepsFromWebpack(service);
    expect(service).toEqual({
      custom: {
        webpack: {
          includeModules: {
            forceExclude: ["datadog-lambda-js", "dd-trace"],
          },
        },
      },
    });
  });
  it("doesn't replace includeModules:false", () => {
    const service = {
      custom: {
        webpack: {
          includeModules: false,
        },
      },
    } as any;
    forceExcludeDepsFromWebpack(service);
    expect(service).toEqual({
      custom: {
        webpack: {
          includeModules: false,
        },
      },
    });
  });
  it("doesn't modify webpack when dependencies already included", () => {
    const service = {
      custom: {
        webpack: {
          includeModules: {
            forceExclude: ["datadog-lambda-js", "dd-trace"],
          },
        },
      },
    } as any;
    forceExcludeDepsFromWebpack(service);
    expect(service).toEqual({
      custom: {
        webpack: {
          includeModules: {
            forceExclude: ["datadog-lambda-js", "dd-trace"],
          },
        },
      },
    });
  });
});

describe("setEnvConfiguration", () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = {};
  });

  it("sets env vars for all handlers with different runtimes", () => {
    const handlers: FunctionInfo[] = [
      {
        handler: {
          environment: {},
          events: [],
        },
        name: "function",
        type: RuntimeType.NODE,
      },
      {
        handler: {
          environment: {},
          events: [],
        },
        name: "function2",
        type: RuntimeType.DOTNET,
      },
      {
        handler: {
          environment: {},
          events: [],
        },
        name: "function3",
        type: RuntimeType.RUBY,
      },
      {
        handler: {
          environment: {},
          events: [],
        },
        name: "function4",
        type: RuntimeType.JAVA,
      },
    ];

    setEnvConfiguration(
      {
        addLayers: false,
        apiKey: "1234",
        apiKeySecretArn: "some-resource:from:aws:secrets-manager:arn",
        apiKMSKey: "0912",
        site: "datadoghq.eu",
        subdomain: "app",
        logLevel: "debug",
        flushMetricsToLogs: true,
        enableXrayTracing: true,
        enableDDTracing: true,
        enableDDLogs: true,
        addExtension: false,
        enableTags: true,
        injectLogContext: false,
        subscribeToAccessLogs: true,
        subscribeToExecutionLogs: false,
        exclude: ["dd-excluded-function"],
        enableSourceCodeIntegration: true,
        captureLambdaPayload: false,
        failOnError: false,
      },
      handlers,
    );
    expect(handlers).toEqual([
      {
        handler: {
          environment: {
            DD_API_KEY: "1234",
            DD_API_KEY_SECRET_ARN: "some-resource:from:aws:secrets-manager:arn",
            DD_CAPTURE_LAMBDA_PAYLOAD: false,
            DD_FLUSH_TO_LOG: true,
            DD_KMS_API_KEY: "0912",
            DD_LOG_LEVEL: "debug",
            DD_SITE: "datadoghq.eu",
            DD_TRACE_ENABLED: true,
            DD_MERGE_XRAY_TRACES: true,
            DD_LOGS_INJECTION: false,
            DD_SERVERLESS_LOGS_ENABLED: true,
          },
          events: [],
        },
        name: "function",
        type: RuntimeType.NODE,
      },
      {
        handler: {
          environment: {
            DD_API_KEY: "1234",
            DD_API_KEY_SECRET_ARN: "some-resource:from:aws:secrets-manager:arn",
            DD_CAPTURE_LAMBDA_PAYLOAD: false,
            DD_FLUSH_TO_LOG: true,
            DD_KMS_API_KEY: "0912",
            DD_LOG_LEVEL: "debug",
            DD_SITE: "datadoghq.eu",
            DD_TRACE_ENABLED: true,
            DD_MERGE_XRAY_TRACES: true,
            DD_LOGS_INJECTION: false,
            DD_SERVERLESS_LOGS_ENABLED: true,
            CORECLR_ENABLE_PROFILING: "1",
            CORECLR_PROFILER: "{846F5F1C-F9AE-4B07-969E-05C26BC060D8}",
            CORECLR_PROFILER_PATH: "/opt/datadog/Datadog.Trace.ClrProfiler.Native.so",
            DD_DOTNET_TRACER_HOME: "/opt/datadog",
          },
          events: [],
        },
        name: "function2",
        type: RuntimeType.DOTNET,
      },
      {
        handler: {
          environment: {
            DD_API_KEY: "1234",
            DD_API_KEY_SECRET_ARN: "some-resource:from:aws:secrets-manager:arn",
            DD_CAPTURE_LAMBDA_PAYLOAD: false,
            DD_FLUSH_TO_LOG: true,
            DD_KMS_API_KEY: "0912",
            DD_LOG_LEVEL: "debug",
            DD_SITE: "datadoghq.eu",
            DD_TRACE_ENABLED: true,
            DD_MERGE_XRAY_TRACES: true,
            DD_LOGS_INJECTION: false,
            DD_SERVERLESS_LOGS_ENABLED: true,
          },
          events: [],
        },
        name: "function3",
        type: RuntimeType.RUBY,
      },
      {
        handler: {
          environment: {
            DD_API_KEY: "1234",
            DD_API_KEY_SECRET_ARN: "some-resource:from:aws:secrets-manager:arn",
            DD_CAPTURE_LAMBDA_PAYLOAD: false,
            DD_FLUSH_TO_LOG: true,
            DD_KMS_API_KEY: "0912",
            DD_LOG_LEVEL: "debug",
            DD_SITE: "datadoghq.eu",
            DD_TRACE_ENABLED: true,
            DD_MERGE_XRAY_TRACES: true,
            DD_LOGS_INJECTION: false,
            DD_SERVERLESS_LOGS_ENABLED: true,
            JAVA_TOOL_OPTIONS:
              '-javaagent:"/opt/java/lib/dd-java-agent.jar" -XX:+TieredCompilation -XX:TieredStopAtLevel=1',
            DD_JMXFETCH_ENABLED: false,
          },
          events: [],
        },
        name: "function4",
        type: RuntimeType.JAVA,
      },
    ]);
  });

  it("doesn't overwrite already present env vars", () => {
    const handlers: FunctionInfo[] = [
      {
        handler: {
          environment: {
            DD_API_KEY: "1234",
            DD_FLUSH_TO_LOG: "true",
            DD_KMS_API_KEY: "5678",
            DD_LOG_LEVEL: "debug",
            DD_SITE: "datadoghq.eu",
            DD_TRACE_ENABLED: "false",
            DD_MERGE_XRAY_TRACES: "false",
            DD_LOGS_INJECTION: "false",
          },
          events: [],
        },
        name: "function",
        type: RuntimeType.NODE,
      },
      {
        handler: {
          environment: {},
          events: [],
        },
        name: "function2",
        type: RuntimeType.NODE,
      },
    ];

    setEnvConfiguration(
      {
        addLayers: false,
        apiKey: "aaaa",
        apiKMSKey: "bbbb",
        site: "datadoghq.com",
        subdomain: "app",
        logLevel: "info",
        flushMetricsToLogs: false,
        enableXrayTracing: true,
        enableDDTracing: true,
        enableDDLogs: true,
        addExtension: false,
        enableTags: true,
        injectLogContext: true,
        subscribeToAccessLogs: true,
        subscribeToExecutionLogs: false,
        exclude: [],
        enableSourceCodeIntegration: true,
        failOnError: false,
      },
      handlers,
    );
    expect(handlers).toEqual([
      {
        handler: {
          environment: {
            DD_API_KEY: "1234",
            DD_FLUSH_TO_LOG: "true",
            DD_KMS_API_KEY: "5678",
            DD_LOG_LEVEL: "debug",
            DD_SITE: "datadoghq.eu",
            DD_SERVERLESS_LOGS_ENABLED: true,
            DD_TRACE_ENABLED: "false",
            DD_MERGE_XRAY_TRACES: "false",
            DD_LOGS_INJECTION: "false",
          },
          events: [],
        },
        name: "function",
        type: RuntimeType.NODE,
      },
      {
        handler: {
          environment: {
            DD_API_KEY: "aaaa",
            DD_FLUSH_TO_LOG: false,
            DD_KMS_API_KEY: "bbbb",
            DD_LOGS_INJECTION: true,
            DD_LOG_LEVEL: "info",
            DD_SERVERLESS_LOGS_ENABLED: true,
            DD_SITE: "datadoghq.com",
            DD_TRACE_ENABLED: true,
            DD_MERGE_XRAY_TRACES: true,
          },
          events: [],
        },
        name: "function2",
        type: RuntimeType.NODE,
      },
    ]);
  });

  it("doesn't set DD_API_KEY if apiKMSKey and DATADOG_API_KEY in the environment are defined", () => {
    process.env = {};
    process.env.DATADOG_API_KEY = "dd-api-key";
    const handlers: FunctionInfo[] = [
      {
        handler: {
          environment: {
            DD_FLUSH_TO_LOG: "true",
            DD_LOG_LEVEL: "debug",
            DD_SITE: "datadoghq.eu",
            DD_TRACE_ENABLED: "false",
            DD_LOGS_INJECTION: "false",
          },
          events: [],
        },
        name: "function",
        type: RuntimeType.NODE,
      },
    ];

    setEnvConfiguration(
      {
        addLayers: false,
        apiKMSKey: "bbbb",
        site: "datadoghq.com",
        subdomain: "app",
        logLevel: "info",
        flushMetricsToLogs: false,
        enableXrayTracing: true,
        enableDDTracing: true,
        enableDDLogs: true,
        addExtension: false,
        enableTags: true,
        injectLogContext: true,
        subscribeToAccessLogs: true,
        subscribeToExecutionLogs: false,
        exclude: [],
        enableSourceCodeIntegration: true,
        failOnError: false,
      },
      handlers,
    );
    expect(handlers).toEqual([
      {
        handler: {
          environment: {
            DD_FLUSH_TO_LOG: "true",
            DD_KMS_API_KEY: "bbbb",
            DD_LOG_LEVEL: "debug",
            DD_SITE: "datadoghq.eu",
            DD_SERVERLESS_LOGS_ENABLED: true,
            DD_TRACE_ENABLED: "false",
            DD_MERGE_XRAY_TRACES: true,
            DD_LOGS_INJECTION: "false",
          },
          events: [],
        },
        name: "function",
        type: RuntimeType.NODE,
      },
    ]);
  });

  it("does not define `DD_FLUSH_TO_LOG` when `addExtension` is true", () => {
    const handlers: FunctionInfo[] = [
      {
        handler: {
          environment: {},
          events: [],
        },
        name: "function",
        type: RuntimeType.NODE,
      },
    ];
    setEnvConfiguration(
      {
        addLayers: false,
        apiKey: "1234",
        apiKMSKey: "5678",
        site: "datadoghq.eu",
        subdomain: "app",
        logLevel: "debug",
        flushMetricsToLogs: true,
        enableXrayTracing: true,
        enableDDTracing: true,
        enableDDLogs: true,
        subscribeToAccessLogs: true,
        subscribeToExecutionLogs: false,
        addExtension: true,
        enableTags: true,
        injectLogContext: false,
        exclude: ["dd-excluded-function"],
        enableSourceCodeIntegration: true,
        failOnError: false,
      },
      handlers,
    );
    expect(handlers).toEqual([
      {
        handler: {
          environment: {
            DD_API_KEY: "1234",
            DD_KMS_API_KEY: "5678",
            DD_LOGS_INJECTION: false,
            DD_LOG_LEVEL: "debug",
            DD_SERVERLESS_LOGS_ENABLED: true,
            DD_SITE: "datadoghq.eu",
            DD_TRACE_ENABLED: true,
            DD_MERGE_XRAY_TRACES: true,
          },
          events: [],
        },
        name: "function",
        type: RuntimeType.NODE,
      },
    ]);
  });

  it("does not define `DD_LOG_LEVEL` by default when logLevel is undefined", () => {
    const handlers: FunctionInfo[] = [
      {
        handler: {
          environment: {},
          events: [],
        },
        name: "function",
        type: RuntimeType.NODE,
      },
    ];
    setEnvConfiguration(
      {
        addLayers: false,
        apiKey: "1234",
        apiKMSKey: "5678",
        site: "datadoghq.eu",
        subdomain: "app",
        logLevel: undefined,
        flushMetricsToLogs: true,
        enableXrayTracing: true,
        enableDDTracing: true,
        enableDDLogs: true,
        subscribeToAccessLogs: true,
        subscribeToExecutionLogs: false,
        addExtension: true,
        enableTags: true,
        injectLogContext: false,
        exclude: ["dd-excluded-function"],
        enableSourceCodeIntegration: true,
        failOnError: false,
      },
      handlers,
    );
    expect(handlers).toEqual([
      {
        handler: {
          environment: {
            DD_API_KEY: "1234",
            DD_KMS_API_KEY: "5678",
            DD_LOGS_INJECTION: false,
            DD_SERVERLESS_LOGS_ENABLED: true,
            DD_SITE: "datadoghq.eu",
            DD_TRACE_ENABLED: true,
            DD_MERGE_XRAY_TRACES: true,
          },
          events: [],
        },
        name: "function",
        type: RuntimeType.NODE,
      },
    ]);
  });

  it("defines `DD_LOG_LEVEL` when logLevel is defined", () => {
    const handlers: FunctionInfo[] = [
      {
        handler: {
          environment: {},
          events: [],
        },
        name: "function",
        type: RuntimeType.NODE,
      },
    ];
    setEnvConfiguration(
      {
        addLayers: false,
        apiKey: "1234",
        apiKMSKey: "5678",
        site: "datadoghq.eu",
        subdomain: "app",
        logLevel: "info",
        flushMetricsToLogs: true,
        enableXrayTracing: true,
        enableDDTracing: true,
        enableDDLogs: true,
        subscribeToAccessLogs: true,
        subscribeToExecutionLogs: false,
        addExtension: true,
        enableTags: true,
        injectLogContext: false,
        exclude: ["dd-excluded-function"],
        enableSourceCodeIntegration: true,
        failOnError: false,
      },
      handlers,
    );
    expect(handlers).toEqual([
      {
        handler: {
          environment: {
            DD_API_KEY: "1234",
            DD_KMS_API_KEY: "5678",
            DD_LOGS_INJECTION: false,
            DD_SERVERLESS_LOGS_ENABLED: true,
            DD_LOG_LEVEL: "info",
            DD_SITE: "datadoghq.eu",
            DD_TRACE_ENABLED: true,
            DD_MERGE_XRAY_TRACES: true,
          },
          events: [],
        },
        name: "function",
        type: RuntimeType.NODE,
      },
    ]);
  });

  it("throws error when trying to add `DD_API_KEY_SECRET_ARN` while using sync metrics in a node runtime", () => {
    const handlers: FunctionInfo[] = [
      {
        handler: {
          environment: {},
          events: [],
          runtime: "nodejs12.x",
        },
        name: "function",
        type: RuntimeType.NODE,
      },
    ];

    expect(() => {
      setEnvConfiguration(
        {
          addLayers: false,
          apiKeySecretArn: "some-resource:from:aws:secrets-manager:arn",
          site: "datadoghq.eu",
          subdomain: "app",
          logLevel: "debug",
          flushMetricsToLogs: false,
          enableXrayTracing: true,
          enableDDTracing: true,
          enableDDLogs: true,
          subscribeToAccessLogs: true,
          subscribeToExecutionLogs: false,
          addExtension: false,
          enableTags: true,
          injectLogContext: false,
          exclude: ["dd-excluded-function"],
          enableSourceCodeIntegration: true,
          failOnError: false,
        },
        handlers,
      );
    }).toThrowError(
      "apiKeySecretArn` is not supported for Node runtimes when using Synchronous Metrics. Set DATADOG_API_KEY in your environment, or use `apiKmsKey` in the configuration.",
    );
  });
});
