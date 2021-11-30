/*
 * Unless explicitly stated otherwise all files in this repository are licensed
 * under the Apache License Version 2.0.
 *
 * This product includes software developed at Datadog (https://www.datadoghq.com/).
 * Copyright 2021 Datadog, Inc.
 */

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
        service: {
          provider: {
            region: "us-east-1",
          },
          functions: {
            node1: {
              handler: "my-func.ev",
              runtime: "nodejs14.x",
            },
          },
        },
      };

      const plugin = new ServerlessPlugin(serverless, {});
      await plugin.hooks["after:package:initialize"]();
      expect(serverless).toMatchObject({
        service: {
          functions: {
            node1: {
              handler: "my-func.ev",
              layers: [expect.stringMatching(/arn\:aws\:lambda\:us\-east\-1\:.*\:layer\:.*/)],
              runtime: "nodejs14.x",
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
        service: {
          provider: {
            region: "us-east-1",
          },
          functions: {
            node1: {
              handler: "my-func.ev",
              runtime: "nodejs14.x",
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
      await plugin.hooks["after:package:initialize"]();
      expect(serverless).toMatchObject({
        service: {
          functions: {
            node1: {
              handler: "my-func.ev",
              layers: [expect.stringMatching(/arn\:aws\:lambda\:us\-east\-1\:.*\:layer\:Datadog-Extension\:.*/)],
              runtime: "nodejs14.x",
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
        service: {
          provider: {
            region: "us-east-1",
          },
          functions: {
            node1: {
              handler: "my-func.ev",
              runtime: "nodejs14.x",
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
      await plugin.hooks["after:package:initialize"]();
      expect(serverless).toMatchObject({
        service: {
          functions: {
            node1: {
              handler: "my-func.ev",
              layers: [
                expect.stringMatching(/arn\:aws\:lambda\:us\-east\-1\:.*\:layer\:.*/),
                expect.stringMatching(/arn\:aws\:lambda\:us\-east\-1\:.*\:layer\:Datadog-Extension\:.*/),
              ],
              runtime: "nodejs14.x",
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
        service: {
          provider: {
            region: "us-east-1",
          },
          functions: {
            node1: {
              handler: "my-func.ev",
              layers: [],
              runtime: "nodejs14.x",
            },
          },
          custom: {
            datadog: {
              addLayers: false,
            },
          },
        },
      };

      const plugin = new ServerlessPlugin(serverless, {});
      await plugin.hooks["after:package:initialize"]();
      expect(serverless).toMatchObject({
        service: {
          functions: {
            node1: {
              handler: "my-func.ev",
              layers: [],
              runtime: "nodejs14.x",
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
              runtime: "nodejs14.x",
            },
          },
          custom: {
            datadog: {
              exclude: ["node1"],
              addLayers: true,
            },
          },
        },
      };

      const plugin = new ServerlessPlugin(serverless, {});
      await plugin.hooks["after:package:initialize"]();
      expect(serverless).toMatchObject({
        service: {
          functions: {
            node1: {
              handler: "my-func.ev",
              layers: [],
              runtime: "nodejs14.x",
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
        service: {
          provider: {
            region: "us-east-1",
          },
          functions: {
            node1: {
              handler: "my-func.ev",
              layers: [],
              runtime: "nodejs14.x",
            },
          },
          custom: {
            datadog: {
              enableXrayTracing: true,
            },
          },
        },
      };

      const plugin = new ServerlessPlugin(serverless, {});
      await plugin.hooks["after:package:initialize"]();
      expect(serverless).toMatchObject({
        service: {
          functions: {
            node1: {
              handler: "my-func.ev",
              layers: [expect.stringMatching(/arn\:aws\:lambda\:us\-east\-1\:.*\:layer\:.*/)],
              runtime: "nodejs14.x",
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
              runtime: "nodejs14.x",
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
        await plugin.hooks["after:package:initialize"]();
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
              runtime: "nodejs14.x",
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
        await plugin.hooks["after:package:initialize"]();
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
              runtime: "nodejs14.x",
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
        await plugin.hooks["after:package:initialize"]();
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
              runtime: "nodejs14.x",
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
        await plugin.hooks["after:package:initialize"]();
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
              runtime: "nodejs14.x",
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
        await plugin.hooks["after:package:initialize"]();
      } catch (e) {
        threwError = true;
        if (e instanceof Error) {
          thrownErrorMessage = e.message;
        }
      }
      expect(threwError).toBe(true);
      expect(thrownErrorMessage).toEqual(
        "Warning: Invalid site URL. Must be either datadoghq.com, datadoghq.eu, us3.datadoghq.com, us5.datadoghq.com, or ddog-gov.com.",
      );
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
              runtime: "nodejs14.x",
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
        await plugin.hooks["after:package:initialize"]();
      } catch (e) {
        threwError = true;
        if (e instanceof Error) {
          thrownErrorMessage = e.message;
        }
      }
      expect(threwError).toBe(true);
      expect(thrownErrorMessage).toEqual(
        "When `addExtension` is true, the environment variable `DATADOG_API_KEY` or configuration variable `apiKMSKey` or `apiKeySecretArn` must be set.",
      );
    });
  });

  it("allows use of DATADOG_API_KEY and DATADOG_APP_KEY to create monitors", async () => {
    process.env.DATADOG_API_KEY = "1234";
    process.env.DATADOG_APP_KEY = "5678";
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
            runtime: "nodejs14.x",
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
      await plugin.hooks["after:package:initialize"]();
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
      service: {
        provider: {
          region: "us-east-1",
        },
        functions: {
          node1: {
            handler: "my-func.ev",
            runtime: "nodejs14.x",
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
      await plugin.hooks["after:package:initialize"]();
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
            runtime: "nodejs14.x",
          },
        },
        custom: {
          datadog: {
            flushMetricsToLogs: false,
            monitors: true,
          },
        },
      },
    };

    const plugin = new ServerlessPlugin(serverless, {});
    let threwError: boolean = false;
    let thrownErrorMessage: string | undefined;
    try {
      await plugin.hooks["after:package:initialize"]();
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

    it("adds tags by default with service name and stage values", async () => {
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
              runtime: "nodejs14.x",
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
  });
});
