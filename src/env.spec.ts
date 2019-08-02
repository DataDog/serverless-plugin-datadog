import { getConfig, defaultConfiguration, setEnvConfiguration } from "./env";

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
      flushMetricsToLogs: false,
      logLevel: "debug",
      site: "datadoghq.com",
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
