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

describe("ServerlessPlugin", () => {
  describe("beforeDeployFunction", () => {
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

    it("cleans up temp handler files afterwards", async () => {
      mock({
        [datadogDirectory]: {
          "handler-1.js": "my-content",
          "handler-2.js": "also-content",
        },
      });
      const serverless = { cli: { log: () => {} } };
      const plugin = new ServerlessPlugin(serverless, {});
      await plugin.hooks["after:package:createDeploymentArtifacts"]();
      expect(fs.existsSync(datadogDirectory)).toBeFalsy();
    });
  });
});
