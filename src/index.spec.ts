/*
 * Unless explicitly stated otherwise all files in this repository are licensed
 * under the Apache License Version 2.0.
 *
 * This product includes software developed at Datadog (https://www.datadoghq.com/).
 * Copyright 2019 Datadog, Inc.
 */

const ServerlessPlugin = require("./index");

import { datadogDirectory } from "./wrapper";
import fs from "fs";
import mock from "mock-fs";
import Aws from "serverless/plugins/aws/provider/awsProvider";

function awsMock(): Aws {
  return {
    getStage: () => "dev",
    request: (service, method, params: any) => Promise.reject("Log group doesn't exist"),
  } as Aws;
}

describe("ServerlessPlugin", () => {
  describe("beforePackageFunction", () => {
    afterEach(() => {
      mock.restore();
    });

    it("creates a wrapped lambda", async () => {
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
              handler: "datadog_handlers/node1.ev",
              layers: [expect.stringMatching(/arn\:aws\:lambda\:us\-east\-1\:.*\:layer\:.*/)],
              runtime: "nodejs8.10",
            },
          },

          package: {
            include: ["datadog_handlers/node1.js", "datadog_handlers/**"],
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
              handler: "datadog_handlers/node1.ev",
              layers: [],
              runtime: "nodejs8.10",
            },
          },

          package: {
            include: ["datadog_handlers/node1.js", "datadog_handlers/**"],
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

    it("skips adding tracing when enableXrayTracing is false", async () => {
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
              handler: "datadog_handlers/node1.ev",
              layers: [],
              runtime: "nodejs8.10",
            },
          },
          custom: {
            datadog: {
              enableXrayTracing: false,
            },
          },
        },
      };

      const plugin = new ServerlessPlugin(serverless, {});
      await plugin.hooks["after:package:initialize"]();
      expect(Object.keys(serverless.service.provider)).not.toContain("tracing");
    });
  });
  describe("afterPackageFunction", () => {
    afterEach(() => {
      mock.restore();
    });
    it("cleans up temp handler files afterwards", async () => {
      mock({
        [datadogDirectory]: {
          "handler-1.js": "my-content",
          "handler-2.js": "also-content",
        },
      });
      const serverless = { cli: { log: () => {} }, service: { custom: {} } };
      const plugin = new ServerlessPlugin(serverless, {});
      await plugin.hooks["after:package:createDeploymentArtifacts"]();
      expect(fs.existsSync(datadogDirectory)).toBeFalsy();
    });

    it("adds subscription filters when fowarderArn is set", async () => {
      mock({
        [datadogDirectory]: {
          "handler-1.js": "my-content",
          "handler-2.js": "also-content",
        },
      });
      const serverless = {
        cli: { log: () => {} },
        getProvider: awsMock,
        service: {
          getServiceName: () => "dev",
          provider: {
            compiledCloudFormationTemplate: {
              Resources: {
                FirstGroup: {
                  Type: "AWS::Logs::LogGroup",
                  Properties: {
                    LogGroupName: "/aws/lambda/first-group",
                  },
                },
              },
            },
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
        "FirstGroupSubscription",
      );
    });
  });
});
