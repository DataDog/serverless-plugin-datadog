/*
 * Unless explicitly stated otherwise all files in this repository are licensed
 * under the Apache License Version 2.0.
 *
 * This product includes software developed at Datadog (https://www.datadoghq.com/).
 * Copyright 2019 Datadog, Inc.
 */

import {
  getConfig,
  defaultConfiguration,
  setEnvConfiguration,
  forceExcludeDepsFromWebpack,
  hasWebpackPlugin,
} from "./env";

describe("hasWebpackPlugin", () => {
  it("returns false when the serverless.yml plugin(s) object is not defined", () => {
    const service = {
      plugins: undefined,
    } as any;
    const result = hasWebpackPlugin(service);
    expect(result).toBe(false);
  });

  it("returns false when the serverless.yml plugin(s) object does not define the serverless-webpack plugin", () => {
    const service = {
      plugins: ["serverless-plugin-datadog"],
    } as any;
    const result = hasWebpackPlugin(service);
    expect(result).toBe(false);
  });

  it("returns true when the serverless.yml plugin(s) object does define the serverless-webpack plugin", () => {
    const service = {
      plugins: ["serverless-plugin-datadog", "serverless-webpack"],
    } as any;
    const result = hasWebpackPlugin(service);
    expect(result).toBe(true);
  });

  it("returns false when the serverless.yml enhanced plugin(s) object does not define the serverless-webpack plugin", () => {
    const service = {
      plugins: {
        localPath: "",
        modules: ["serverless-plugin-datadog"],
      },
    } as any;
    const result = hasWebpackPlugin(service);
    expect(result).toBe(false);
  });

  it("returns true when the serverless.yml enhanced plugin(s) object does define the serverless-webpack plugin", () => {
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
  it("get a default configuration when none is present", () => {
    const result = getConfig({ custom: {} } as any);
    expect(result).toEqual(defaultConfiguration);
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
      site: "datadoghq.com",
      enableXrayTracing: false,
      enableDDTracing: true,
      enableTags: true,
      injectLogContext: true,
      exclude: [],
    });
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
  it("sets env vars", () => {
    const service = {
      provider: {},
    } as any;
    setEnvConfiguration(
      {
        addLayers: false,
        apiKey: "1234",
        apiKMSKey: "5678",
        site: "datadoghq.eu",
        logLevel: "debug",
        flushMetricsToLogs: true,
        enableXrayTracing: true,
        enableDDTracing: true,
        enableTags: true,
        injectLogContext: false,
        exclude: ["dd-excluded-function"],
      },
      service,
    );
    expect(service).toEqual({
      provider: {
        environment: {
          DD_API_KEY: "1234",
          DD_FLUSH_TO_LOG: true,
          DD_KMS_API_KEY: "5678",
          DD_LOG_LEVEL: "debug",
          DD_SITE: "datadoghq.eu",
          DD_TRACE_ENABLED: true,
          DD_LOGS_INJECTION: false,
        },
      },
    });
  });

  it("doesn't overwrite already present env vars", () => {
    const service = {
      provider: {
        environment: {
          DD_API_KEY: "1234",
          DD_FLUSH_TO_LOG: true,
          DD_KMS_API_KEY: "5678",
          DD_LOG_LEVEL: "debug",
          DD_SITE: "datadoghq.eu",
          DD_TRACE_ENABLED: false,
          DD_LOGS_INJECTION: false,
        },
      },
    } as any;
    setEnvConfiguration(
      {
        addLayers: false,
        apiKey: "aaaa",
        apiKMSKey: "bbbb",
        site: "datadoghq.com",
        logLevel: "info",
        flushMetricsToLogs: false,
        enableXrayTracing: true,
        enableDDTracing: true,
        enableTags: true,
        injectLogContext: true,
        exclude: [],
      },
      service,
    );
    expect(service).toEqual({
      provider: {
        environment: {
          DD_API_KEY: "1234",
          DD_FLUSH_TO_LOG: true,
          DD_KMS_API_KEY: "5678",
          DD_LOG_LEVEL: "debug",
          DD_SITE: "datadoghq.eu",
          DD_TRACE_ENABLED: false,
          DD_LOGS_INJECTION: false,
        },
      },
    });
  });
});
