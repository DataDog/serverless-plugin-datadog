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
    setSourceCodeIntegrationEnvVar(handler, "1234", "github.com/datadog/test");
    expect(handler.environment![ddTagsEnvVar]).toEqual(
      "sample_tag:sample_val,git.commit.sha:1234,git.repository_url:github.com/datadog/test",
    );
  });

  it("sets git.commit.sha when no DD_TAGS are found in the environment", () => {
    let handler = {
      events: [],
      environment: {
        SOME_KEY: "some_val",
      },
    } as ExtendedFunctionDefinition;
    setSourceCodeIntegrationEnvVar(handler, "1234", "github.com/datadog/test");
    expect(handler.environment![ddTagsEnvVar]).toEqual(
      "git.commit.sha:1234,git.repository_url:github.com/datadog/test",
    );
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
      subscribeToStepFunctionLogs: false,
      enableSourceCodeIntegration: true,
      uploadGitMetadata: true,
      failOnError: false,
      skipCloudformationOutputs: false,
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
      subscribeToStepFunctionLogs: false,
      enableSourceCodeIntegration: true,
      uploadGitMetadata: true,
      failOnError: false,
      skipCloudformationOutputs: false,
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
      subscribeToStepFunctionLogs: false,
      customHandler: "/src/custom-handler.handler",
      enableSourceCodeIntegration: true,
      uploadGitMetadata: true,
      failOnError: false,
      skipCloudformationOutputs: false,
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
    subscribeToStepFunctionLogs: false,
    enableSourceCodeIntegration: false,
    uploadGitMetadata: true,
    failOnError: false,
    skipCloudformationOutputs: false,
  });
});

it("disable git metadata upload", () => {
  const result = getConfig({
    custom: {
      datadog: {
        apiKey: "1234",
        logLevel: "debug",
        uploadGitMetadata: false,
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
    subscribeToStepFunctionLogs: false,
    enableSourceCodeIntegration: true,
    uploadGitMetadata: false,
    failOnError: false,
    skipCloudformationOutputs: false,
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
        subscribeToStepFunctionLogs: false,
        exclude: ["dd-excluded-function"],
        enableSourceCodeIntegration: true,
        uploadGitMetadata: false,
        captureLambdaPayload: false,
        failOnError: false,
        skipCloudformationOutputs: false,
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
            AWS_LAMBDA_EXEC_WRAPPER: "/opt/datadog_wrapper",
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
            AWS_LAMBDA_EXEC_WRAPPER: "/opt/datadog_wrapper",
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
        subscribeToStepFunctionLogs: false,
        exclude: [],
        enableSourceCodeIntegration: true,
        uploadGitMetadata: false,
        failOnError: false,
        skipCloudformationOutputs: false,
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
        subscribeToStepFunctionLogs: false,
        exclude: [],
        enableSourceCodeIntegration: true,
        uploadGitMetadata: false,
        failOnError: false,
        skipCloudformationOutputs: false,
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
        subscribeToStepFunctionLogs: false,
        addExtension: true,
        enableTags: true,
        injectLogContext: false,
        exclude: ["dd-excluded-function"],
        enableSourceCodeIntegration: true,
        uploadGitMetadata: false,
        failOnError: false,
        skipCloudformationOutputs: false,
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

  it("sets `DD_LOGS_INJECTION` to false when `addExtension` is true", () => {
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
        subscribeToStepFunctionLogs: false,
        addExtension: true,
        enableTags: true,
        injectLogContext: false,
        exclude: ["dd-excluded-function"],
        enableSourceCodeIntegration: true,
        uploadGitMetadata: false,
        failOnError: false,
        skipCloudformationOutputs: false,
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
        subscribeToStepFunctionLogs: false,
        addExtension: true,
        enableTags: true,
        injectLogContext: false,
        exclude: ["dd-excluded-function"],
        enableSourceCodeIntegration: true,
        uploadGitMetadata: false,
        failOnError: false,
        skipCloudformationOutputs: false,
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
        subscribeToStepFunctionLogs: false,
        addExtension: true,
        enableTags: true,
        injectLogContext: false,
        exclude: ["dd-excluded-function"],
        enableSourceCodeIntegration: true,
        uploadGitMetadata: false,
        failOnError: false,
        skipCloudformationOutputs: false,
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
          subscribeToStepFunctionLogs: false,
          addExtension: false,
          enableTags: true,
          injectLogContext: false,
          exclude: ["dd-excluded-function"],
          enableSourceCodeIntegration: true,
          uploadGitMetadata: false,
          failOnError: false,
          skipCloudformationOutputs: false,
        },
        handlers,
      );
    }).toThrowError(
      "apiKeySecretArn` is not supported for Node runtimes when using Synchronous Metrics. Set DATADOG_API_KEY in your environment, or use `apiKmsKey` in the configuration.",
    );
  });
  it("defines `DD_COLD_START_TRACING` when enableColdStartTracing is set", () => {
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
        subscribeToStepFunctionLogs: false,
        addExtension: true,
        enableTags: true,
        injectLogContext: false,
        exclude: ["dd-excluded-function"],
        enableSourceCodeIntegration: true,
        uploadGitMetadata: false,
        failOnError: false,
        skipCloudformationOutputs: false,
        enableColdStartTracing: false,
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
            DD_COLD_START_TRACING: false,
          },
          events: [],
        },
        name: "function",
        type: RuntimeType.NODE,
      },
    ]);
  });
  it("defines `DD_COLD_START_TRACING_SKIP_LIBS` when coldStartTracingSkipLibs is set", () => {
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
        subscribeToStepFunctionLogs: false,
        addExtension: true,
        enableTags: true,
        injectLogContext: false,
        exclude: ["dd-excluded-function"],
        enableSourceCodeIntegration: true,
        uploadGitMetadata: false,
        failOnError: false,
        skipCloudformationOutputs: false,
        coldStartTraceSkipLibs: "my-dep,your-dep",
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
            DD_COLD_START_TRACE_SKIP_LIB: "my-dep,your-dep",
          },
          events: [],
        },
        name: "function",
        type: RuntimeType.NODE,
      },
    ]);
  });
  it("defines `DD_MIN_COLD_START_DURATION` when minColdStartTraceDuration is set", () => {
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
        subscribeToStepFunctionLogs: false,
        addExtension: true,
        enableTags: true,
        injectLogContext: false,
        exclude: ["dd-excluded-function"],
        enableSourceCodeIntegration: true,
        uploadGitMetadata: false,
        failOnError: false,
        skipCloudformationOutputs: false,
        minColdStartTraceDuration: 50,
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
            DD_MIN_COLD_START_DURATION: 50,
          },
          events: [],
        },
        name: "function",
        type: RuntimeType.NODE,
      },
    ]);
  });
  it("defines `DD_PROFILING_ENABLED` when enableProfiling is set", () => {
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
        subscribeToStepFunctionLogs: false,
        addExtension: true,
        enableTags: true,
        injectLogContext: false,
        exclude: ["dd-excluded-function"],
        enableSourceCodeIntegration: true,
        uploadGitMetadata: false,
        failOnError: false,
        skipCloudformationOutputs: false,
        enableProfiling: true,
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
            DD_PROFILING_ENABLED: true,
          },
          events: [],
        },
        name: "function",
        type: RuntimeType.NODE,
      },
    ]);
  });
  it("defines `DD_ENCODE_AUTHORIZER_CONTEXT` when encodeAuthorizerContext is set", () => {
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
        subscribeToStepFunctionLogs: false,
        addExtension: true,
        enableTags: true,
        injectLogContext: false,
        exclude: ["dd-excluded-function"],
        enableSourceCodeIntegration: true,
        uploadGitMetadata: false,
        failOnError: false,
        skipCloudformationOutputs: false,
        encodeAuthorizerContext: true,
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
            DD_ENCODE_AUTHORIZER_CONTEXT: true,
          },
          events: [],
        },
        name: "function",
        type: RuntimeType.NODE,
      },
    ]);
  });
  it("defines `DD_DECODE_AUTHORIZER_CONTEXT` when decodeAuthorizerContext is set", () => {
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
        subscribeToStepFunctionLogs: false,
        addExtension: true,
        enableTags: true,
        injectLogContext: false,
        exclude: ["dd-excluded-function"],
        enableSourceCodeIntegration: true,
        uploadGitMetadata: false,
        failOnError: false,
        skipCloudformationOutputs: false,
        decodeAuthorizerContext: true,
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
            DD_DECODE_AUTHORIZER_CONTEXT: true,
          },
          events: [],
        },
        name: "function",
        type: RuntimeType.NODE,
      },
    ]);
  });

  describe("defines `DD_APM_FLUSH_DEADLINE_MILLISECONDS` when `apmFlushDeadline` is set", () => {
    let handlers: FunctionInfo[] = [];
    beforeEach(() => {
      handlers = [
        {
          handler: {
            environment: {},
            events: [],
          },
          name: "function",
          type: RuntimeType.NODE,
        },
      ];
    });

    it("setting the value as a number", () => {
      setEnvConfiguration(
        {
          addLayers: false,
          apiKey: "1234",
          site: "datadoghq.com",
          subdomain: "app",
          logLevel: "info",
          flushMetricsToLogs: true,
          enableXrayTracing: true,
          enableDDTracing: true,
          enableDDLogs: true,
          subscribeToAccessLogs: true,
          subscribeToStepFunctionLogs: false,
          subscribeToExecutionLogs: false,
          addExtension: true,
          enableTags: true,
          injectLogContext: false,
          exclude: ["dd-excluded-function"],
          enableSourceCodeIntegration: true,
          uploadGitMetadata: false,
          failOnError: false,
          skipCloudformationOutputs: false,
          // `DD_APM_FLUSH_DEADLINE_MILLISECONDS` = 50
          apmFlushDeadline: 50.0,
        },
        handlers,
      );
      expect(handlers).toEqual([
        {
          handler: {
            environment: {
              DD_API_KEY: "1234",
              DD_LOGS_INJECTION: false,
              DD_SERVERLESS_LOGS_ENABLED: true,
              DD_LOG_LEVEL: "info",
              DD_SITE: "datadoghq.com",
              DD_TRACE_ENABLED: true,
              DD_MERGE_XRAY_TRACES: true,
              DD_APM_FLUSH_DEADLINE_MILLISECONDS: 50,
            },
            events: [],
          },
          name: "function",
          type: RuntimeType.NODE,
        },
      ]);
    });

    it("setting the value as a string", () => {
      setEnvConfiguration(
        {
          addLayers: false,
          apiKey: "1234",
          site: "datadoghq.com",
          subdomain: "app",
          logLevel: "info",
          flushMetricsToLogs: true,
          enableXrayTracing: true,
          enableDDTracing: true,
          enableDDLogs: true,
          subscribeToAccessLogs: true,
          subscribeToStepFunctionLogs: false,
          subscribeToExecutionLogs: false,
          addExtension: true,
          enableTags: true,
          injectLogContext: false,
          exclude: ["dd-excluded-function"],
          enableSourceCodeIntegration: true,
          uploadGitMetadata: false,
          failOnError: false,
          skipCloudformationOutputs: false,
          // `DD_APM_FLUSH_DEADLINE_MILLISECONDS` = 50
          apmFlushDeadline: "50",
        },
        handlers,
      );
      expect(handlers).toEqual([
        {
          handler: {
            environment: {
              DD_API_KEY: "1234",
              DD_LOGS_INJECTION: false,
              DD_SERVERLESS_LOGS_ENABLED: true,
              DD_LOG_LEVEL: "info",
              DD_SITE: "datadoghq.com",
              DD_TRACE_ENABLED: true,
              DD_MERGE_XRAY_TRACES: true,
              DD_APM_FLUSH_DEADLINE_MILLISECONDS: "50",
            },
            events: [],
          },
          name: "function",
          type: RuntimeType.NODE,
        },
      ]);
    });
  });
});
