/*
 * Unless explicitly stated otherwise all files in this repository are licensed
 * under the Apache License Version 2.0.
 *
 * This product includes software developed at Datadog (https://www.datadoghq.com/).
 * Copyright 2021 Datadog, Inc.
 */

jest.mock("./monitors.ts", () => {
  return {
    setMonitors: async (shouldThrow: Boolean) => {
      if (shouldThrow) {
        throw new Error("Some Error Occurred");
      }
      return true;
    },
  };
});

const ServerlessPlugin = require("./index");

import mock from "mock-fs";
import { FunctionDefinition } from "serverless";
import Aws from "serverless/plugins/aws/provider/awsProvider";

const SEM_VER_REGEX =
  /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-(0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(\.(0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?(\+[0-9a-zA-Z-]+(\.[0-9a-zA-Z-]+)*)?$/;

function awsMock(): Aws {
  return {
    getAccountId: () => Promise.resolve("111111111111"),
    getStage: () => "dev",
    getRegion: () => "us-east-1",
    request: (_service, method, _params: any) => {
      if (method == "describeSubscriptionFilters") {
        return Promise.reject("Log group doesn't exist");
      }
      return Promise.resolve();
    },
    naming: {
      getStackName: () => "",
    } as { [key: string]: () => string },
  } as Aws;
}

function functionMock(mockTags: { [key: string]: string }): FunctionDefinition {
  const mockPackage = { include: [], exclude: [] };
  return {
    name: "node1",
    package: mockPackage,
    handler: "my-func.ev",
    events: [],
    tags: mockTags,
  } as FunctionDefinition;
}

describe("ServerlessPlugin", () => {
  describe("beforePackageFunction", () => {
    afterEach(() => {
      mock.restore();
    });

    it("adds lambda library layers by default and doesn't change handler", async () => {
      mock({});
      const serverless = {
        cli: {
          log: () => {},
        },
        getProvider: (_name: string) => awsMock(),
        service: {
          getServiceName: () => "dev",
          provider: {
            region: "us-east-1",
          },
          functions: {
            node1: {
              handler: "my-func.ev",
              runtime: "nodejs20.x",
            },
          },
          custom: {
            datadog: {
              apiKey: 1234,
            },
          },
        },
      };

      const plugin = new ServerlessPlugin(serverless, {});
      await plugin.hooks["before:package:createDeploymentArtifacts"]();
      expect(serverless).toMatchObject({
        service: {
          functions: {
            node1: {
              handler: "my-func.ev",
              layers: [
                expect.stringMatching(/arn\:aws\:lambda\:us\-east\-1\:.*\:layer\:.*/),
                expect.stringMatching(/arn:aws:lambda:us-east-1:464622532012:layer:Datadog-Extension:(.*)*/),
              ],
              runtime: "nodejs20.x",
            },
          },
          provider: {
            region: "us-east-1",
          },
        },
      });
    });

    it("only adds lambda Extension layer when `addExtension` is true and `addLayers` is false", async () => {
      mock({});
      const serverless = {
        cli: {
          log: () => {},
        },
        getProvider: (_name: string) => awsMock(),
        service: {
          getServiceName: () => "dev",
          provider: {
            region: "us-east-1",
          },
          functions: {
            node1: {
              handler: "my-func.ev",
              runtime: "nodejs20.x",
            },
          },
          custom: {
            datadog: {
              addExtension: true,
              flushMetricsToLogs: false,
              addLayers: false,
              apiKMSKey: "1234",
            },
          },
        },
      };

      const plugin = new ServerlessPlugin(serverless, {});
      await plugin.hooks["before:package:createDeploymentArtifacts"]();
      expect(serverless).toMatchObject({
        service: {
          functions: {
            node1: {
              handler: "my-func.ev",
              layers: [expect.stringMatching(/arn\:aws\:lambda\:us\-east\-1\:.*\:layer\:Datadog-Extension\:.*/)],
              runtime: "nodejs20.x",
            },
          },
          provider: {
            region: "us-east-1",
          },
        },
      });
    });

    it("adds the lambda Extension and library layers when `addExtension` and `addLayers` parameters are true", async () => {
      mock({});
      const serverless = {
        cli: {
          log: () => {},
        },
        getProvider: (_name: string) => awsMock(),
        service: {
          getServiceName: () => "dev",
          provider: {
            region: "us-east-1",
          },
          functions: {
            node1: {
              handler: "my-func.ev",
              runtime: "nodejs20.x",
            },
          },
          custom: {
            datadog: {
              addExtension: true,
              flushMetricsToLogs: false,
              addLayers: true, // defauts to true
              apiKey: "1234",
            },
          },
        },
      };

      const plugin = new ServerlessPlugin(serverless, {});
      await plugin.hooks["before:package:createDeploymentArtifacts"]();
      expect(serverless).toMatchObject({
        service: {
          functions: {
            node1: {
              handler: "my-func.ev",
              layers: [
                expect.stringMatching(/arn\:aws\:lambda\:us\-east\-1\:.*\:layer\:.*/),
                expect.stringMatching(/arn\:aws\:lambda\:us\-east\-1\:.*\:layer\:Datadog-Extension\:.*/),
              ],
              runtime: "nodejs20.x",
            },
          },
          provider: {
            region: "us-east-1",
          },
        },
      });
    });

    it("skips adding lambda layers when addLayers is false", async () => {
      mock({});
      const serverless = {
        cli: {
          log: () => {},
        },
        getProvider: (_name: string) => awsMock(),
        service: {
          getServiceName: () => "dev",
          provider: {
            region: "us-east-1",
          },
          functions: {
            node1: {
              handler: "my-func.ev",
              layers: [],
              runtime: "nodejs20.x",
            },
          },
          custom: {
            datadog: {
              addLayers: false,
              apiKey: 1234,
            },
          },
        },
      };

      const plugin = new ServerlessPlugin(serverless, {});
      await plugin.hooks["before:package:createDeploymentArtifacts"]();
      expect(serverless).toMatchObject({
        service: {
          functions: {
            node1: {
              handler: "my-func.ev",
              layers: [expect.stringMatching(/arn\:aws\:lambda\:us\-east\-1\:.*\:layer\:Datadog-Extension\:.*/)],
              runtime: "nodejs20.x",
            },
          },
          provider: {
            region: "us-east-1",
          },
        },
      });
    });

    it("ignores functions contained within exclude", async () => {
      mock({});
      const serverless = {
        cli: {
          log: () => {},
        },
        service: {
          provider: {
            region: "us-east-1",
          },
          functions: {
            node1: {
              handler: "my-func.ev",
              layers: [],
              runtime: "nodejs20.x",
            },
          },
          custom: {
            datadog: {
              exclude: ["node1"],
              addLayers: true,
              apiKey: 1234,
            },
          },
        },
      };

      const plugin = new ServerlessPlugin(serverless, {});
      await plugin.hooks["before:package:createDeploymentArtifacts"]();
      expect(serverless).toMatchObject({
        service: {
          functions: {
            node1: {
              handler: "my-func.ev",
              layers: [],
              runtime: "nodejs20.x",
            },
          },
          provider: {
            region: "us-east-1",
          },
        },
      });
    });

    it("Adds tracing when enableXrayTracing is true", async () => {
      mock({});
      const serverless = {
        cli: {
          log: () => {},
        },
        getProvider: (_name: string) => awsMock(),
        service: {
          getServiceName: () => "dev",
          provider: {
            region: "us-east-1",
          },
          functions: {
            node1: {
              handler: "my-func.ev",
              layers: [],
              runtime: "nodejs20.x",
            },
          },
          custom: {
            datadog: {
              enableXrayTracing: true,
              apiKey: 1234,
            },
          },
        },
      };

      const plugin = new ServerlessPlugin(serverless, {});
      await plugin.hooks["before:package:createDeploymentArtifacts"]();
      expect(serverless).toMatchObject({
        service: {
          functions: {
            node1: {
              handler: "my-func.ev",
              layers: [
                expect.stringMatching(/arn\:aws\:lambda\:us\-east\-1\:.*\:layer\:.*/),
                expect.stringMatching(/arn\:aws\:lambda\:us\-east\-1\:.*\:layer\:Datadog-Extension\:.*/),
              ],
              runtime: "nodejs20.x",
            },
          },
          provider: {
            region: "us-east-1",
            tracing: {
              apiGateway: true,
              lambda: true,
            },
          },
        },
      });
    });

    it("adds FIPS extension layer by default for GovCloud regions", async () => {
      mock({});
      const serverless = {
        cli: {
          log: () => {},
        },
        getProvider: (_name: string) => awsMock(),
        service: {
          getServiceName: () => "dev",
          provider: {
            region: "us-gov-east-1",
          },
          functions: {
            node1: {
              handler: "my-func.ev",
              layers: [],
              runtime: "nodejs20.x",
            },
          },
          custom: {
            datadog: {
              addExtension: true,
              site: "ddog-gov.com",
              apiKey: 1234,
            },
          },
        },
      };

      const plugin = new ServerlessPlugin(serverless, {});
      await plugin.hooks["before:package:createDeploymentArtifacts"]();
      expect(serverless).toMatchObject({
        service: {
          functions: {
            node1: {
              handler: "my-func.ev",
              layers: [
                expect.stringMatching(/arn\:aws\-us\-gov\:lambda\:us\-gov\-east\-1\:.*\:layer\:.*/),
                expect.stringMatching(
                  /arn\:aws\-us\-gov\:lambda\:us\-gov\-east\-1\:.*\:layer\:Datadog-Extension-FIPS\:.*/,
                ),
              ],
              runtime: "nodejs20.x",
            },
          },
          provider: {
            region: "us-gov-east-1",
          },
        },
      });
    });
  });

  it("Adds tracing layer for dotnet", async () => {
    mock({});
    const serverless = {
      cli: {
        log: () => {},
      },
      getProvider: (_name: string) => awsMock(),
      service: {
        getServiceName: () => "dev",
        provider: {
          region: "us-east-1",
        },
        functions: {
          dotnet6: {
            handler: "my-func.ev",
            layers: [],
            runtime: "dotnet6",
          },
        },
        custom: {
          datadog: {
            apiKey: 1234,
          },
        },
      },
    };

    const plugin = new ServerlessPlugin(serverless, {});
    await plugin.hooks["before:package:createDeploymentArtifacts"]();
    expect(serverless).toMatchObject({
      service: {
        functions: {
          dotnet6: {
            handler: "my-func.ev",
            layers: [
              expect.stringMatching(/arn\:aws\:lambda\:us\-east\-1\:.*\:layer\:dd-trace-dotnet\:.*/),
              expect.stringMatching(/arn\:aws\:lambda\:us\-east\-1\:.*\:layer\:Datadog-Extension\:.*/),
            ],
            runtime: "dotnet6",
          },
        },
        provider: {
          region: "us-east-1",
        },
      },
    });
  });

  it("Adds tracing layer for java11", async () => {
    mock({});
    const serverless = {
      cli: {
        log: () => {},
      },
      getProvider: (_name: string) => awsMock(),
      service: {
        getServiceName: () => "dev",
        provider: {
          region: "us-east-1",
        },
        functions: {
          node1: {
            handler: "my-func.ev",
            layers: [],
            runtime: "java11",
          },
        },
        custom: {
          datadog: {
            apiKey: 1234,
          },
        },
      },
    };

    const plugin = new ServerlessPlugin(serverless, {});
    await plugin.hooks["before:package:createDeploymentArtifacts"]();
    expect(serverless).toMatchObject({
      service: {
        functions: {
          node1: {
            handler: "my-func.ev",
            layers: [
              expect.stringMatching(/arn\:aws\:lambda\:us\-east\-1\:.*\:layer\:dd-trace-java\:.*/),
              expect.stringMatching(/arn\:aws\:lambda\:us\-east\-1\:.*\:layer\:Datadog-Extension\:.*/),
            ],
            runtime: "java11",
          },
        },
        provider: {
          region: "us-east-1",
        },
      },
    });
  });

  it("Adds tracing layer for java8.al2", async () => {
    mock({});
    const serverless = {
      cli: {
        log: () => {},
      },
      getProvider: (_name: string) => awsMock(),
      service: {
        getServiceName: () => "dev",
        provider: {
          region: "us-east-1",
        },
        functions: {
          node1: {
            handler: "my-func.ev",
            layers: [],
            runtime: "java8.al2",
          },
        },
        custom: {
          datadog: {
            apiKey: 1234,
          },
        },
      },
    };

    const plugin = new ServerlessPlugin(serverless, {});
    await plugin.hooks["before:package:createDeploymentArtifacts"]();
    expect(serverless).toMatchObject({
      service: {
        functions: {
          node1: {
            handler: "my-func.ev",
            layers: [
              expect.stringMatching(/arn\:aws\:lambda\:us\-east\-1\:.*\:layer\:dd-trace-java\:.*/),
              expect.stringMatching(/arn\:aws\:lambda\:us\-east\-1\:.*\:layer\:Datadog-Extension\:.*/),
            ],
            runtime: "java8.al2",
          },
        },
        provider: {
          region: "us-east-1",
        },
      },
    });
  });

  it("Adds tracing layer for java8", async () => {
    mock({});
    const serverless = {
      cli: {
        log: () => {},
      },
      getProvider: (_name: string) => awsMock(),
      service: {
        getServiceName: () => "dev",
        provider: {
          region: "us-east-1",
        },
        functions: {
          node1: {
            handler: "my-func.ev",
            layers: [],
            runtime: "java8",
          },
        },
        custom: {
          datadog: {
            apiKey: 1234,
          },
        },
      },
    };

    const plugin = new ServerlessPlugin(serverless, {});
    await plugin.hooks["before:package:createDeploymentArtifacts"]();
    expect(serverless).toMatchObject({
      service: {
        functions: {
          node1: {
            handler: "my-func.ev",
            layers: [
              expect.stringMatching(/arn\:aws\:lambda\:us\-east\-1\:.*\:layer\:dd-trace-java\:.*/),
              expect.stringMatching(/arn\:aws\:lambda\:us\-east\-1\:.*\:layer\:Datadog-Extension\:.*/),
            ],
            runtime: "java8",
          },
        },
        provider: {
          region: "us-east-1",
        },
      },
    });
  });

  describe("validateConfiguration", () => {
    afterEach(() => {
      mock.restore();
    });

    beforeEach(() => {
      jest.resetModules();
      process.env = {};
    });

    it("throws error if API key, KMS API, and API key secret ARN are defined", async () => {
      mock({});
      const serverless = {
        cli: {
          log: () => {},
        },
        service: {
          provider: {
            region: "us-east-1",
          },
          functions: {
            node1: {
              handler: "my-func.ev",
              runtime: "nodejs20.x",
            },
          },
          custom: {
            datadog: {
              apiKey: "1234",
              apiKMSKey: "5678",
              apiKeySecretArn: "9101",
            },
          },
        },
      };

      const plugin = new ServerlessPlugin(serverless, {});
      let threwError: boolean = false;
      let thrownErrorMessage: string | undefined;
      try {
        await plugin.hooks["before:package:createDeploymentArtifacts"]();
      } catch (e) {
        threwError = true;
        if (e instanceof Error) {
          thrownErrorMessage = e.message;
        }
      }
      expect(threwError).toBe(true);
      expect(thrownErrorMessage).toEqual(
        "`apiKey`, `apiKMSKey`, and `apiKeySecretArn` should not be set at the same time.",
      );
    });

    it("throws error if both API key and KMS API key are defined", async () => {
      mock({});
      const serverless = {
        cli: {
          log: () => {},
        },
        service: {
          provider: {
            region: "us-east-1",
          },
          functions: {
            node1: {
              handler: "my-func.ev",
              runtime: "nodejs20.x",
            },
          },
          custom: {
            datadog: {
              apiKey: "1234",
              apiKMSKey: "5678",
            },
          },
        },
      };

      const plugin = new ServerlessPlugin(serverless, {});
      let threwError: boolean = false;
      let thrownErrorMessage: string | undefined;
      try {
        await plugin.hooks["before:package:createDeploymentArtifacts"]();
      } catch (e) {
        threwError = true;
        if (e instanceof Error) {
          thrownErrorMessage = e.message;
        }
      }
      expect(threwError).toBe(true);
      expect(thrownErrorMessage).toEqual("`apiKey` and `apiKMSKey` should not be set at the same time.");
    });

    it("throws error if both API key and API key secret ARN are defined", async () => {
      mock({});
      const serverless = {
        cli: {
          log: () => {},
        },
        service: {
          provider: {
            region: "us-east-1",
          },
          functions: {
            node1: {
              handler: "my-func.ev",
              runtime: "nodejs20.x",
            },
          },
          custom: {
            datadog: {
              apiKey: "1234",
              apiKeySecretArn: "5678",
            },
          },
        },
      };

      const plugin = new ServerlessPlugin(serverless, {});
      let threwError: boolean = false;
      let thrownErrorMessage: string | undefined;
      try {
        await plugin.hooks["before:package:createDeploymentArtifacts"]();
      } catch (e) {
        threwError = true;
        if (e instanceof Error) {
          thrownErrorMessage = e.message;
        }
      }
      expect(threwError).toBe(true);
      expect(thrownErrorMessage).toEqual("`apiKey` and `apiKeySecretArn` should not be set at the same time.");
    });

    it("throws error if both KMS API and API key secret ARN are defined", async () => {
      mock({});
      const serverless = {
        cli: {
          log: () => {},
        },
        service: {
          provider: {
            region: "us-east-1",
          },
          functions: {
            node1: {
              handler: "my-func.ev",
              runtime: "nodejs20.x",
            },
          },
          custom: {
            datadog: {
              apiKeySecretArn: "1234",
              apiKMSKey: "5678",
            },
          },
        },
      };

      const plugin = new ServerlessPlugin(serverless, {});
      let threwError: boolean = false;
      let thrownErrorMessage: string | undefined;
      try {
        await plugin.hooks["before:package:createDeploymentArtifacts"]();
      } catch (e) {
        threwError = true;
        if (e instanceof Error) {
          thrownErrorMessage = e.message;
        }
      }
      expect(threwError).toBe(true);
      expect(thrownErrorMessage).toEqual("`apiKMSKey` and `apiKeySecretArn` should not be set at the same time.");
    });

    it("throws an error when site is set to an invalid site URL", async () => {
      mock({});
      const serverless = {
        cli: {
          log: () => {},
        },
        service: {
          provider: {
            region: "us-east-1",
          },
          functions: {
            node1: {
              handler: "my-func.ev",
              runtime: "nodejs20.x",
            },
          },
          custom: {
            datadog: {
              site: "datadogehq.com",
            },
          },
        },
      };

      const plugin = new ServerlessPlugin(serverless, {});
      let threwError: boolean = false;
      let thrownErrorMessage: string | undefined;
      try {
        await plugin.hooks["before:package:createDeploymentArtifacts"]();
      } catch (e) {
        threwError = true;
        if (e instanceof Error) {
          thrownErrorMessage = e.message;
        }
      }
      expect(threwError).toBe(true);
      expect(thrownErrorMessage).toEqual(
        "Warning: Invalid site URL. Must be one of datadoghq.com, datadoghq.eu, us3.datadoghq.com, us5.datadoghq.com, ap1.datadoghq.com, ap2.datadoghq.com, ddog-gov.com.",
      );
    });

    it("does not throw an invalid site error when testingMode is true", async () => {
      mock({});
      const serverless = {
        cli: {
          log: () => {},
        },
        getProvider: (_name: string) => awsMock(),
        service: {
          getServiceName: () => "dev",
          provider: {
            region: "us-east-1",
          },
          functions: {
            node1: {
              handler: "my-func.ev",
              runtime: "nodejs20.x",
            },
          },
          custom: {
            datadog: {
              site: "datadogehq.com",
              testingMode: true,
              apiKey: "1234",
            },
          },
        },
      };

      const plugin = new ServerlessPlugin(serverless, {});
      let threwError: boolean = false;
      try {
        await plugin.hooks["before:package:createDeploymentArtifacts"]();
      } catch (e) {
        threwError = true;
        if (e instanceof Error) {
          console.log(e.message);
        }
      }
      expect(threwError).toBe(false);
    });

    it("throws error when addExtension is true and both API key and KMS API key are undefined", async () => {
      mock({});
      const serverless = {
        cli: {
          log: () => {},
        },
        service: {
          provider: {
            region: "us-east-1",
          },
          functions: {
            node1: {
              handler: "my-func.ev",
              runtime: "nodejs20.x",
            },
          },
          custom: {
            datadog: {
              addExtension: true,
              flushMetricsToLogs: false,
            },
          },
        },
      };

      const plugin = new ServerlessPlugin(serverless, {});
      let threwError: boolean = false;
      let thrownErrorMessage: string | undefined;
      try {
        await plugin.hooks["before:package:createDeploymentArtifacts"]();
      } catch (e) {
        threwError = true;
        if (e instanceof Error) {
          thrownErrorMessage = e.message;
        }
      }
      expect(threwError).toBe(true);
      expect(thrownErrorMessage).toEqual(
        "The environment variable `DATADOG_API_KEY` or configuration variable `apiKMSKey` or `apiKeySecretArn` must be set because `addExtension` is set to true as default.",
      );
    });
  });

  it("allows use of DATADOG_API_KEY and DATADOG_APP_KEY to create monitors", async () => {
    process.env.DATADOG_API_KEY = "1234";
    process.env.DATADOG_APP_KEY = "5678";

    const serverless = {
      cli: {
        log: () => {},
      },
      getProvider: (_name: string) => awsMock(),
      service: {
        getServiceName: () => "dev",
        provider: {
          region: "us-east-1",
        },
        functions: {
          node1: {
            handler: "my-func.ev",
            runtime: "nodejs20.x",
          },
        },
        custom: {
          datadog: {
            addExtension: true,
            flushMetricsToLogs: false,
            monitors: true,
          },
        },
      },
    };

    const plugin = new ServerlessPlugin(serverless, {});
    let threwError: boolean = false;
    try {
      await plugin.hooks["before:package:createDeploymentArtifacts"]();
    } catch (e) {
      threwError = true;
    }
    expect(threwError).toBe(false);
  });

  it("allows use of monitorsApiKey and monitorsAppKey to create a lambda with monitors", async () => {
    mock({});
    const serverless = {
      cli: {
        log: () => {},
      },
      getProvider: (_name: string) => awsMock(),
      service: {
        getServiceName: () => "dev",
        provider: {
          region: "us-east-1",
        },
        functions: {
          node1: {
            handler: "my-func.ev",
            runtime: "nodejs20.x",
          },
        },
        custom: {
          datadog: {
            addExtension: true,
            flushMetricsToLogs: false,
            monitors: true,
            monitorsApiKey: "1234",
            monitorsAppKey: "5678",
          },
        },
      },
    };

    const plugin = new ServerlessPlugin(serverless, {});
    let threwError: boolean = false;
    try {
      await plugin.hooks["before:package:createDeploymentArtifacts"]();
    } catch (e) {
      threwError = true;
    }
    expect(threwError).toBe(false);
  });

  it("throws an error if not all keys required by monitors are defined", async () => {
    process.env = {};
    mock({});
    const serverless = {
      cli: {
        log: () => {},
      },
      service: {
        provider: {
          region: "us-east-1",
        },
        functions: {
          node1: {
            handler: "my-func.ev",
            runtime: "nodejs20.x",
          },
        },
        custom: {
          datadog: {
            flushMetricsToLogs: false,
            monitors: true,
            apiKey: 1234,
          },
        },
      },
    };

    const plugin = new ServerlessPlugin(serverless, {});
    let threwError: boolean = false;
    let thrownErrorMessage: string | undefined;
    try {
      await plugin.hooks["before:package:createDeploymentArtifacts"]();
    } catch (e) {
      threwError = true;
      if (e instanceof Error) {
        thrownErrorMessage = e.message;
      }
    }
    expect(threwError).toBe(true);
    expect(thrownErrorMessage).toEqual(
      "When `monitors` is enabled, `DATADOG_API_KEY` and `DATADOG_APP_KEY` environment variables must be set.",
    );
  });

  it("throws an error if failOnError is set", async () => {
    process.env = {};
    const serverless = {
      cli: {
        log: () => {},
      },
      getProvider: (_name: string) => awsMock(),
      service: {
        getServiceName: () => "dev",
        getAllFunctions: () => [],
        provider: {
          region: "us-east-1",
        },
        functions: {
          node1: {
            handler: "my-func.ev",
            runtime: "nodejs20.x",
          },
        },
        custom: {
          datadog: {
            flushMetricsToLogs: false,
            failOnError: true,
            monitors: true,
            monitorsApiKey: "1234",
            monitorsAppKey: "5678",
          },
        },
      },
    };

    const plugin = new ServerlessPlugin(serverless, {});
    let threwError: boolean = false;
    let thrownErrorMessage: string | undefined;
    try {
      await plugin.hooks["after:deploy:deploy"]();
    } catch (e) {
      threwError = true;
      if (e instanceof Error) {
        thrownErrorMessage = e.message;
      }
    }
    expect(threwError).toBe(true);
    expect(thrownErrorMessage).toEqual("Some Error Occurred");
  });

  describe("afterPackageFunction", () => {
    afterEach(() => {
      mock.restore();
    });
    it("adds subscription filters when forwarderArn is set", async () => {
      const serverless = {
        cli: { log: () => {} },
        getProvider: (_name: string) => awsMock(),
        service: {
          getServiceName: () => "dev",
          getAllFunctions: () => [],
          provider: {
            compiledCloudFormationTemplate: {
              Resources: {
                FirstLogGroup: {
                  Type: "AWS::Logs::LogGroup",
                  Properties: {
                    LogGroupName: "/aws/lambda/first",
                  },
                },
              },
            },
          },
          functions: {
            first: {},
          },
          custom: {
            datadog: {
              forwarderArn: "some-arn",
              addExtension: false,
            },
          },
        },
      };
      const plugin = new ServerlessPlugin(serverless, {});
      await plugin.hooks["after:package:createDeploymentArtifacts"]();
      expect(serverless.service.provider.compiledCloudFormationTemplate.Resources).toHaveProperty(
        "FirstLogGroupSubscription",
      );
    });

    it("adds subscription filters when forwarder is set", async () => {
      const serverless = {
        cli: { log: () => {} },
        getProvider: awsMock,
        service: {
          getServiceName: () => "dev",
          getAllFunctions: () => [],
          provider: {
            compiledCloudFormationTemplate: {
              Resources: {
                FirstLogGroup: {
                  Type: "AWS::Logs::LogGroup",
                  Properties: {
                    LogGroupName: "/aws/lambda/first",
                  },
                },
              },
            },
          },
          functions: {
            first: {},
          },
          custom: {
            datadog: {
              forwarder: "some-arn",
              addExtension: false,
            },
          },
        },
      };
      const plugin = new ServerlessPlugin(serverless, {});
      await plugin.hooks["after:package:createDeploymentArtifacts"]();
      expect(serverless.service.provider.compiledCloudFormationTemplate.Resources).toHaveProperty(
        "FirstLogGroupSubscription",
      );
    });

    it("does not subscribe to lambda log groups when the extension is enabled", async () => {
      const serverless = {
        cli: { log: () => {} },
        getProvider: awsMock,
        service: {
          getServiceName: () => "dev",
          getAllFunctions: () => [],
          provider: {
            compiledCloudFormationTemplate: {
              Resources: {
                FirstLogGroup: {
                  Type: "AWS::Logs::LogGroup",
                  Properties: {
                    LogGroupName: "/aws/lambda/first",
                  },
                },
              },
            },
          },
          functions: {
            first: {},
          },
          custom: {
            datadog: {
              forwarder: "some-arn",
              addExtension: true,
            },
          },
        },
      };
      const plugin = new ServerlessPlugin(serverless, {});
      await plugin.hooks["after:package:createDeploymentArtifacts"]();
      expect(serverless.service.provider.compiledCloudFormationTemplate.Resources).not.toHaveProperty(
        "FirstLogGroupSubscription",
      );
    });
    it("does subscribe to non-lambda log groups when the extension is enabled", async () => {
      const serverless = {
        cli: { log: () => {} },
        getProvider: awsMock,
        service: {
          getServiceName: () => "dev",
          getAllFunctions: () => [],
          provider: {
            logs: { restApi: true },
            compiledCloudFormationTemplate: {
              Resources: {
                ApiGroup: {
                  Type: "AWS::Logs::LogGroup",
                  Properties: {
                    LogGroupName: "/aws/api-gateway/first-group",
                  },
                },
                HttpGroup: {
                  Type: "AWS::Logs::LogGroup",
                  Properties: {
                    LogGroupName: "/aws/http-api/second-group",
                  },
                },
                WebsocketGroup: {
                  Type: "AWS::Logs::LogGroup",
                  Properties: {
                    LogGroupName: "/aws/websocket/third-group",
                  },
                },
              },
            },
          },
          functions: {},
          custom: {
            datadog: {
              forwarder: "some-arn",
              addExtension: true,
            },
          },
        },
      };

      const plugin = new ServerlessPlugin(serverless, {});
      await plugin.hooks["after:package:createDeploymentArtifacts"]();
      expect(serverless.service.provider.compiledCloudFormationTemplate.Resources).toHaveProperty(
        "ApiGroupSubscription",
      );
    });
    it("throws an error when forwarderArn and forwarder are set", async () => {
      const serverless = {
        cli: { log: () => {} },
        getProvider: awsMock,
        service: {
          getServiceName: () => "dev",
          getAllFunctions: () => [],
          provider: {
            compiledCloudFormationTemplate: {
              Resources: {
                FirstLogGroup: {
                  Type: "AWS::Logs::LogGroup",
                  Properties: {
                    LogGroupName: "/aws/lambda/first-group",
                  },
                },
              },
            },
          },
          functions: {},
          custom: {
            datadog: {
              forwarderArn: "some-arn",
              forwarder: "some-arn",
            },
          },
        },
      };
      const plugin = new ServerlessPlugin(serverless, {});
      let throwsError;
      try {
        await plugin.hooks["after:package:createDeploymentArtifacts"]();
      } catch (e) {
        throwsError = true;
      }
      expect(throwsError).toBe(true);
    });

    it("does not add subscription filters when neither the forwarderArn nor the forwarder are set", async () => {
      const serverless = {
        cli: { log: () => {} },
        getProvider: awsMock,
        service: {
          getServiceName: () => "dev",
          getAllFunctions: () => [],
          provider: {
            compiledCloudFormationTemplate: {
              Resources: {
                FirstLogGroup: {
                  Type: "AWS::Logs::LogGroup",
                  Properties: {
                    LogGroupName: "/aws/lambda/first-group",
                  },
                },
              },
            },
          },
          functions: {},
          custom: {
            datadog: {},
          },
        },
      };
      const plugin = new ServerlessPlugin(serverless, {});
      await plugin.hooks["after:package:createDeploymentArtifacts"]();
      expect(serverless.service.provider.compiledCloudFormationTemplate.Resources).not.toHaveProperty(
        "FirstLogGroupSubscription",
      );
    });

    it("only adds dd_sls_plugin tag when enabledTags is false", async () => {
      const function_ = functionMock({ env: "test" });
      const serverless = {
        cli: { log: () => {} },
        getProvider: awsMock,
        enabled: true,
        service: {
          provider: {
            region: "us-east-1",
          },
          functions: {
            node1: function_,
          },
          getServiceName: () => "dev",
          getAllFunctions: () => [function_],
          getFunction: () => function_,
          custom: {
            datadog: {
              enableTags: false,
            },
          },
        },
      };
      const plugin = new ServerlessPlugin(serverless, {});
      await plugin.hooks["after:package:createDeploymentArtifacts"]();
      expect(function_).toHaveProperty("tags", {
        env: "test",
        dd_sls_plugin: expect.stringMatching(SEM_VER_REGEX),
      });
    });

    it("adds tags by default with service name and stage values when using forwarder and not extension", async () => {
      const function_ = functionMock({});
      const serverless = {
        cli: { log: () => {} },
        getProvider: awsMock,
        service: {
          getServiceName: () => "dev",
          getAllFunctions: () => [function_],
          getFunction: () => function_,
          provider: {
            region: "us-east-1",
          },
          functions: {
            node1: function_,
          },
          custom: {
            datadog: {
              forwarderArn: "some-arn",
              addExtension: false,
            },
          },
        },
      };
      const plugin = new ServerlessPlugin(serverless, {});
      await plugin.hooks["after:package:createDeploymentArtifacts"]();
      expect(function_).toHaveProperty("tags", {
        env: "dev",
        service: "dev",
        dd_sls_plugin: expect.stringMatching(SEM_VER_REGEX),
      });
    });

    it("does not override existing tags on function", async () => {
      const function_ = functionMock({ service: "test" });
      const serverless = {
        cli: { log: () => {} },
        getProvider: awsMock,
        service: {
          getServiceName: () => "dev",
          getAllFunctions: () => [function_],
          getFunction: () => function_,
          provider: {
            region: "us-east-1",
          },
          functions: {
            node1: function_,
          },
          custom: {
            datadog: {
              addExtension: false,
            },
          },
        },
      };
      const plugin = new ServerlessPlugin(serverless, {});
      await plugin.hooks["after:package:createDeploymentArtifacts"]();
      expect(function_).toHaveProperty("tags", {
        env: "dev",
        service: "test",
        dd_sls_plugin: expect.stringMatching(SEM_VER_REGEX),
      });
    });

    it("does not override tags set on provider level", async () => {
      const function_ = functionMock({});
      const serverless = {
        cli: { log: () => {} },
        getProvider: awsMock,
        service: {
          getServiceName: () => "my-service",
          getAllFunctions: () => [function_],
          getFunction: () => function_,
          provider: {
            region: "us-east-1",
            tags: {
              service: "service-name",
            },
            stackTags: {
              env: "dev",
            },
          },
          functions: {
            node1: function_,
          },
        },
      };
      const plugin = new ServerlessPlugin(serverless, {});
      await plugin.hooks["after:package:createDeploymentArtifacts"]();

      // The service and env tags will be set with the values given in the provider instead
      expect(function_).toHaveProperty("tags", { dd_sls_plugin: expect.stringMatching(SEM_VER_REGEX) });
    });

    it("does not override tags on an excluded function", async () => {
      const function_ = functionMock({});
      const serverless = {
        cli: { log: () => {} },
        getProvider: awsMock,
        service: {
          getServiceName: () => "my-service",
          getAllFunctions: () => ["node1"],
          getFunction: () => function_,
          provider: {
            region: "us-east-1",
            tags: {
              service: "service-name",
            },
            stackTags: {
              env: "dev",
            },
          },
          functions: {
            node1: {
              handler: "my-func.ev",
              layers: [],
              runtime: "nodejs20.x",
              tags: {
                service: "test",
              },
            },
          },
          custom: {
            datadog: {
              exclude: ["node1"],
            },
          },
        },
      };
      const plugin = new ServerlessPlugin(serverless, {});
      await plugin.hooks["after:package:createDeploymentArtifacts"]();

      // The service and env tags will be set with the values given in the provider instead
      expect(function_).toHaveProperty("tags", {});
    });

    it("Does not attempt add execution log groups if subscribeToExecutionLogs is false", async () => {
      const serverless = {
        cli: { log: () => {} },
        getProvider: (_name: string) => awsMock(),
        service: {
          getServiceName: () => "dev",
          getAllFunctions: () => [],
          provider: {
            logs: {
              restApi: true,
            },
            compiledCloudFormationTemplate: {
              Resources: {
                FirstLogGroup: {
                  Type: "AWS::Logs::LogGroup",
                  Properties: {
                    LogGroupName: "/aws/api-gateway/first",
                  },
                },
              },
            },
          },
          functions: {
            first: {},
          },
          custom: {
            datadog: {
              forwarderArn: "some-arn",
              subscribeToExecutionLogs: false,
            },
          },
        },
      };
      const plugin = new ServerlessPlugin(serverless, {});
      await plugin.hooks["after:package:createDeploymentArtifacts"]();
      expect(serverless.service.provider.compiledCloudFormationTemplate.Resources).not.toHaveProperty(
        "RestExecutionLogGroup",
      );
    });

    it("Does attempt to add execution log groups if subscribeToExecutionLogs is true", async () => {
      const serverless = {
        cli: { log: () => {} },
        getProvider: (_name: string) => awsMock(),
        service: {
          getServiceName: () => "dev",
          getAllFunctions: () => [],
          provider: {
            logs: {
              restApi: true,
            },
            compiledCloudFormationTemplate: {
              Resources: {
                FirstLogGroup: {
                  Type: "AWS::Logs::LogGroup",
                  Properties: {
                    LogGroupName: "/aws/api-gateway/first",
                  },
                },
              },
            },
          },
          functions: {
            first: {},
          },
          custom: {
            datadog: {
              forwarderArn: "some-arn",
              subscribeToExecutionLogs: true,
            },
          },
        },
      };
      const plugin = new ServerlessPlugin(serverless, {});
      await plugin.hooks["after:package:createDeploymentArtifacts"]();
      expect(serverless.service.provider.compiledCloudFormationTemplate.Resources).toHaveProperty(
        "RestExecutionLogGroup",
      );
    });

    it("Throws an error if the config has old properties", async () => {
      const serverless = {
        cli: { log: () => {} },
        getProvider: (_name: string) => awsMock(),
        service: {
          getServiceName: () => "dev",
          getAllFunctions: () => [],
          provider: {
            logs: {
              restApi: true,
            },
            compiledCloudFormationTemplate: {
              Resources: {
                FirstLogGroup: {
                  Type: "AWS::Logs::LogGroup",
                  Properties: {
                    LogGroupName: "/aws/api-gateway/first",
                  },
                },
              },
            },
          },
          functions: {
            first: {},
          },
          custom: {
            datadog: {
              forwarderArn: "some-arn",
              subscribeToExecutionLogs: true,
              subscribeToApiGatewayLogs: true,
            },
          },
        },
      };
      const plugin = new ServerlessPlugin(serverless, {});
      expect(async () => {
        await plugin.hooks["after:datadog:generate:init"]();
      }).rejects.toThrowError(
        "The following configuration options have been removed: subscribeToApiGatewayLogs. Please use the subscribeToAccessLogs or subscribeToExecutionLogs options instead.",
      );
    });

    it("Throws the correct error if the config has multiple old properties", async () => {
      const serverless = {
        cli: { log: () => {} },
        getProvider: (_name: string) => awsMock(),
        service: {
          getServiceName: () => "dev",
          getAllFunctions: () => [],
          provider: {
            logs: {
              restApi: true,
            },
            compiledCloudFormationTemplate: {
              Resources: {
                FirstLogGroup: {
                  Type: "AWS::Logs::LogGroup",
                  Properties: {
                    LogGroupName: "/aws/api-gateway/first",
                  },
                },
              },
            },
          },
          functions: {
            first: {},
          },
          custom: {
            datadog: {
              forwarderArn: "some-arn",
              subscribeToExecutionLogs: true,
              subscribeToApiGatewayLogs: true,
              subscribeToHttpApiLogs: true,
              subscribeToWebsocketLogs: true,
            },
          },
        },
      };
      const plugin = new ServerlessPlugin(serverless, {});
      expect(async () => {
        await plugin.hooks["after:datadog:generate:init"]();
      }).rejects.toThrowError(
        "The following configuration options have been removed: subscribeToApiGatewayLogs subscribeToHttpApiLogs subscribeToWebsocketLogs. Please use the subscribeToAccessLogs or subscribeToExecutionLogs options instead.",
      );
    });

    it("Logs error when enableSourceCodeIntegration is true and both API key and API key secret ARN are undefined", async () => {
      mock({});
      let logs = "";
      const serverless = {
        cli: {
          log: (logMsg: string) => {
            logs += logMsg;
          },
        },
        getProvider: (_name: string) => awsMock(),
        service: {
          provider: {
            region: "us-east-1",
          },
          functions: {
            node1: {
              handler: "my-func.ev",
              runtime: "nodejs20.x",
            },
          },
          custom: {
            datadog: {
              addExtension: true,
              flushMetricsToLogs: false,
            },
          },
        },
      };

      const plugin = new ServerlessPlugin(serverless, {});
      await plugin.hooks["after:package:createDeploymentArtifacts"]();
      expect(logs).toContain(
        "Skipping enabling source code integration because Datadog credentials were not found. Please set either DATADOG_API_KEY in your environment, or set the apiKey parameter in Serverless.",
      );
    });

    it("logs error when enableSourceCodeIntegration is true and only API key secret ARN is defined", async () => {
      mock({});
      let logs = "";
      const serverless = {
        cli: {
          log: (logMsg: string) => {
            logs += logMsg;
          },
        },
        getProvider: (_name: string) => awsMock(),
        service: {
          provider: {
            region: "us-east-1",
          },
          functions: {
            node1: {
              handler: "my-func.ev",
              runtime: "nodejs20.x",
            },
          },
          custom: {
            datadog: {
              addExtension: true,
              apiKeySecretArn: "1234",
              flushMetricsToLogs: false,
            },
          },
        },
      };

      const plugin = new ServerlessPlugin(serverless, {});
      await plugin.hooks["after:package:createDeploymentArtifacts"]();
      expect(logs).toContain(
        "Skipping enabling source code integration because encrypted credentials through KMS/Secrets Manager is not supported for this integration. Please set either DATADOG_API_KEY in your environment, or set the apiKey parameter in Serverless.",
      );
    });

    it("Does attempt to add Step Function log group subscription if subscribeToStepFunctionLogs is true", async () => {
      const serverless = {
        cli: { log: () => {} },
        getProvider: (_name: string) => awsMock(),
        service: {
          getServiceName: () => "dev",
          getAllFunctions: () => [],
          provider: {
            compiledCloudFormationTemplate: {
              Resources: {},
            },
          },
          functions: {
            function1: {},
          },
          stepFunctions: {
            stateMachines: {
              stepfunction1: {
                name: "testStepFunction",
              },
            },
          },
          custom: {
            datadog: {
              forwarderArn: "some-arn",
              subscribeToStepFunctionLogs: true,
            },
          },
        },
      };
      const plugin = new ServerlessPlugin(serverless, {});
      await plugin.hooks["after:package:createDeploymentArtifacts"]();
      expect(serverless.service.provider.compiledCloudFormationTemplate.Resources).toHaveProperty(
        "testStepFunctionLogGroupSubscription",
      );
    });

    it("Does not attempt to add Step Function log group subscription if subscribeToStepFunctionLogs is false", async () => {
      const serverless = {
        cli: { log: () => {} },
        getProvider: (_name: string) => awsMock(),
        service: {
          getServiceName: () => "dev",
          getAllFunctions: () => [],
          provider: {
            compiledCloudFormationTemplate: {
              Resources: {},
            },
          },
          functions: {
            function1: {},
          },
          stepFunctions: {
            stateMachines: {
              stepfunction1: {
                name: "testStepFunction",
              },
            },
          },
          custom: {
            datadog: {
              forwarderArn: "some-arn",
              subscribeToStepFunctionLogs: false,
            },
          },
        },
      };
      const plugin = new ServerlessPlugin(serverless, {});
      await plugin.hooks["after:package:createDeploymentArtifacts"]();
      expect(serverless.service.provider.compiledCloudFormationTemplate.Resources).not.toHaveProperty(
        "testStepFunctionLogGroupSubscription",
      );
    });

    it("Does add Step Function log group and subscription if no log group is already configured", async () => {
      const serverless = {
        cli: { log: () => {} },
        getProvider: (_name: string) => awsMock(),
        service: {
          getServiceName: () => "dev",
          getAllFunctions: () => [],
          provider: {
            compiledCloudFormationTemplate: {
              Resources: {},
            },
          },
          functions: {
            function1: {},
          },
          stepFunctions: {
            stateMachines: {
              stepfunction1: {
                name: "testStepFunction",
              },
            },
          },
          custom: {
            datadog: {
              forwarderArn: "some-arn",
              subscribeToStepFunctionLogs: true,
            },
          },
        },
      };
      const plugin = new ServerlessPlugin(serverless, {});
      await plugin.hooks["after:package:createDeploymentArtifacts"]();
      expect(serverless.service.provider.compiledCloudFormationTemplate.Resources).toHaveProperty(
        "testStepFunctionLogGroup",
      );
      expect(serverless.service.provider.compiledCloudFormationTemplate.Resources).toHaveProperty(
        "testStepFunctionLogGroupSubscription",
      );
    });

    it("Does add Step Function log group subscription if a log group is already configured", async () => {
      const serverless = {
        cli: { log: () => {} },
        getProvider: (_name: string) => awsMock(),
        service: {
          getServiceName: () => "dev",
          getAllFunctions: () => [],
          provider: {
            compiledCloudFormationTemplate: {
              Resources: {},
            },
          },
          functions: {
            function1: {},
          },
          resources: {
            Resources: {
              someOtherStepFunctionLogGroup: {
                Type: "AWS::Logs::LogGroup",
                Properties: {
                  LogGroupName: "/aws/vendedlogs/states/preconfigured-log-group",
                },
              },
            },
          },
          stepFunctions: {
            stateMachines: {
              stepfunction1: {
                name: "testStepFunction",
                loggingConfig: {
                  level: "ALL",
                  includeExecutionData: true,
                  destinations: [
                    "arn:aws:logs:sa-east-1:425362996713:log-group:/aws/vendedlogs/states/preconfigured-log-group:*",
                  ],
                },
              },
            },
          },
          custom: {
            datadog: {
              forwarderArn: "some-arn",
              subscribeToStepFunctionLogs: true,
            },
          },
        },
      };
      const plugin = new ServerlessPlugin(serverless, {});
      await plugin.hooks["after:package:createDeploymentArtifacts"]();
      expect(serverless.service.provider.compiledCloudFormationTemplate.Resources).not.toHaveProperty(
        "someOtherStepFunctionLogGroup",
      );
      expect(serverless.service.provider.compiledCloudFormationTemplate.Resources).toHaveProperty(
        "testStepFunctionLogGroupSubscription",
      );
    });

    it("Does update Step Function logging config if level or includeExecutionData is not configured for tracing", async () => {
      const serverless = {
        cli: { log: () => {} },
        getProvider: (_name: string) => awsMock(),
        service: {
          getServiceName: () => "dev",
          getAllFunctions: () => [],
          provider: {
            compiledCloudFormationTemplate: {
              Resources: {},
            },
          },
          functions: {
            function1: {},
          },
          resources: {
            Resources: {
              someOtherStepFunctionLogGroup: {
                Type: "AWS::Logs::LogGroup",
                Properties: {
                  LogGroupName: "/aws/vendedlogs/states/preconfigured-log-group",
                },
              },
            },
          },
          stepFunctions: {
            stateMachines: {
              stepfunction1: {
                name: "testStepFunction",
                loggingConfig: {
                  level: "Error",
                  includeExecutionData: false,
                  destinations: [
                    "arn:aws:logs:sa-east-1:425362996713:log-group:/aws/vendedlogs/states/preconfigured-log-group:*",
                  ],
                },
              },
            },
          },
          custom: {
            datadog: {
              forwarderArn: "some-arn",
              subscribeToStepFunctionLogs: true,
            },
          },
        },
      };
      const plugin = new ServerlessPlugin(serverless, {});
      await plugin.hooks["after:package:createDeploymentArtifacts"]();
      expect(serverless.service.stepFunctions.stateMachines.stepfunction1.loggingConfig.level).toEqual("ALL");
      expect(serverless.service.stepFunctions.stateMachines.stepfunction1.loggingConfig.includeExecutionData).toEqual(
        true,
      );
    });

    it("sets tags for the state machine", async () => {
      const serverless = {
        cli: { log: () => {} },
        getProvider: (_name: string) => awsMock(),
        service: {
          getServiceName: () => "dev",
          getAllFunctions: () => [],
          provider: {
            compiledCloudFormationTemplate: {
              Resources: {
                FirstStateMachine: {
                  Type: "AWS::StepFunctions::StateMachine",
                  Properties: {},
                },
              },
            },
          },
          functions: {
            function1: {},
          },
          resources: {},
          custom: {
            datadog: {
              forwarderArn: "some-arn",
              env: "prod",
              service: "my-service",
              version: "1.0.0",
              tags: "dd-custom-tag:custom-tag-value",
            },
          },
        },
      };

      const plugin = new ServerlessPlugin(serverless, {});
      await plugin.hooks["after:package:compileFunctions"]();
      expect(
        serverless.service.provider.compiledCloudFormationTemplate.Resources.FirstStateMachine.Properties,
      ).toHaveProperty(
        "Tags",
        expect.arrayContaining([
          { Key: "env", Value: "prod" },
          { Key: "service", Value: "my-service" },
          { Key: "version", Value: "1.0.0" },
          { Key: "dd-custom-tag", Value: "custom-tag-value" },
        ]),
      );
    });

    it("does not override existing tags on the state machine", async () => {
      const serverless = {
        cli: { log: () => {} },
        getProvider: (_name: string) => awsMock(),
        service: {
          getServiceName: () => "dev",
          getAllFunctions: () => [],
          provider: {
            compiledCloudFormationTemplate: {
              Resources: {
                FirstStateMachine: {
                  Type: "AWS::StepFunctions::StateMachine",
                  Properties: {
                    Tags: [
                      { Key: "env", Value: "dev" },
                      { Key: "service", Value: "my-existing-service" },
                      { Key: "version", Value: "0.0.9" },
                      { Key: "dd-custom-tag", Value: "existing-tag-value" },
                    ],
                  },
                },
              },
            },
          },
          functions: {
            function1: {},
          },
          resources: {},
          custom: {
            datadog: {
              forwarderArn: "some-arn",
              env: "prod",
              service: "my-service",
              version: "1.0.0",
              tags: "dd-custom-tag:new-tag-value",
            },
          },
        },
      };

      const plugin = new ServerlessPlugin(serverless, {});
      await plugin.hooks["after:package:compileFunctions"]();
      expect(
        serverless.service.provider.compiledCloudFormationTemplate.Resources.FirstStateMachine.Properties,
      ).toHaveProperty(
        "Tags",
        expect.arrayContaining([
          { Key: "env", Value: "dev" },
          { Key: "service", Value: "my-existing-service" },
          { Key: "version", Value: "0.0.9" },
          { Key: "dd-custom-tag", Value: "existing-tag-value" },
        ]),
      );
    });

    it("redirects by default", async () => {
      mock({});
      const serverless = {
        cli: {
          log: () => {},
        },
        getProvider: (_name: string) => awsMock(),
        service: {
          getServiceName: () => "dev",
          provider: {
            region: "us-east-1",
          },
          functions: {
            nodeFunction: {
              handler: "my-func.handler",
              layers: [],
              runtime: "nodejs20.x",
            },
          },
          custom: {
            datadog: {
              apiKey: 1234,
            },
          },
        },
      };

      const plugin = new ServerlessPlugin(serverless, {});
      await plugin.hooks["after:package:createDeploymentArtifacts"]();
      expect(serverless).toMatchObject({
        service: {
          functions: {
            nodeFunction: {
              handler: "/opt/nodejs/node_modules/datadog-lambda-js/handler.handler",
              layers: [], // layers handled by before:package:createDeploymentArtifacts and out of scope for this test
              runtime: "nodejs20.x",
            },
          },
          provider: {
            region: "us-east-1",
          },
        },
      });
    });
    it("skips redirect when redirectHandlers set to false", async () => {
      mock({});
      const serverless = {
        cli: {
          log: () => {},
        },
        getProvider: (_name: string) => awsMock(),
        service: {
          getServiceName: () => "dev",
          provider: {
            region: "us-east-1",
          },
          functions: {
            nodeFunction: {
              handler: "my-func.handler",
              layers: [],
              runtime: "nodejs20.x",
            },
          },
          custom: {
            datadog: {
              apiKey: 1234,
              redirectHandlers: false,
            },
          },
        },
      };

      const plugin = new ServerlessPlugin(serverless, {});
      await plugin.hooks["after:package:createDeploymentArtifacts"]();
      expect(serverless).toMatchObject({
        service: {
          functions: {
            nodeFunction: {
              handler: "my-func.handler",
              layers: [], // layers handled by before:package:createDeploymentArtifacts and out of scope for this test
              runtime: "nodejs20.x",
            },
          },
          provider: {
            region: "us-east-1",
          },
        },
      });
    });

    // Compiled CloudFormation template may be unavailable if the user only deploys part of the stack.
    // See https://github.com/DataDog/serverless-plugin-datadog/issues/593
    it("does not throw an error if compiled CloudFormation template is unavailable", async () => {
      const serverless = {
        cli: { log: () => {} },
        getProvider: (_name: string) => awsMock(),
        service: {
          getServiceName: () => "dev",
          getAllFunctions: () => [],
          provider: {
            region: "us-east-1",
          },
          functions: {
            first: {},
          },
          custom: {
            datadog: {
              forwarderArn: "some-arn",
              addExtension: false,
              enableStepFunctionsTracing: true,
            },
          },
        },
      };
      const plugin = new ServerlessPlugin(serverless, {});
      await expect(plugin.hooks["after:package:createDeploymentArtifacts"]()).resolves.not.toThrow();
    });
  });
});
