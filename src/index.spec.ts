/*
 * Unless explicitly stated otherwise all files in this repository are licensed
 * under the Apache License Version 2.0.
 *
 * This product includes software developed at Datadog (https://www.datadoghq.com/).
 * Copyright 2021 Datadog, Inc.
 */

const ServerlessPlugin = require("./index");

import mock from "mock-fs";
import Aws from "serverless/plugins/aws/provider/awsProvider";
import { FunctionDefinition } from "serverless";
import { ExtendedFunctionDefinition } from "./index";
import { Configuration, defaultConfiguration } from "./env";

const SEM_VER_REGEX = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-(0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(\.(0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?(\+[0-9a-zA-Z-]+(\.[0-9a-zA-Z-]+)*)?$/;

function awsMock(): Aws {
  return {
    getAccountId: () => Promise.resolve("111111111111"),
    getStage: () => "dev",
    request: (service, method, params: any) => {
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
              runtime: "nodejs8.10",
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
              runtime: "nodejs8.10",
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
              runtime: "nodejs8.10",
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
              runtime: "nodejs8.10",
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
              runtime: "nodejs8.10",
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
              runtime: "nodejs8.10",
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
              runtime: "nodejs8.10",
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
              runtime: "nodejs8.10",
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
              runtime: "nodejs8.10",
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
              runtime: "nodejs8.10",
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
              runtime: "nodejs8.10",
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
              runtime: "nodejs8.10",
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
              runtime: "nodejs8.10",
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
        thrownErrorMessage = e.message;
      }
      expect(threwError).toBe(true);
      expect(thrownErrorMessage).toEqual("`apiKey` and `apiKMSKey` should not be set at the same time.");
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
              runtime: "nodejs8.10",
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
        thrownErrorMessage = e.message;
      }
      expect(threwError).toBe(true);
      expect(thrownErrorMessage).toEqual(
        "Warning: Invalid site URL. Must be either datadoghq.com, datadoghq.eu, us3.datadoghq.com, or ddog-gov.com.",
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
              runtime: "nodejs8.10",
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
        thrownErrorMessage = e.message;
      }
      expect(threwError).toBe(true);
      expect(thrownErrorMessage).toEqual("When `addExtension` is true, `apiKey` or `apiKMSKey` must also be set.");
    });
  });

  describe("afterPackageFunction", () => {
    afterEach(() => {
      mock.restore();
    });
    it("adds subscription filters when forwarderArn is set", async () => {
      const serverless = {
        cli: { log: () => {} },
        getProvider: (name: string) => awsMock(),
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
              subscribeToApiGatewayLogs: true,
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
              runtime: "nodejs8.10",
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
  });
});
