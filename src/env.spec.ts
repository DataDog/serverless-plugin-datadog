/*
 * Unless explicitly stated otherwise all files in this repository are licensed
 * under the Apache License Version 2.0.
 *
 * This product includes software developed at Datadog (https://www.datadoghq.com/).
 * Copyright 2019 Datadog, Inc.
 */

import { getConfig, defaultConfiguration, setEnvConfiguration, forceExcludeDepsFromWebpack } from "./env";

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
      enableXrayTracing: true,
      enableDDTracing: true,
      enableTags: true,
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
        },
      },
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
