/*
 * Unless explicitly stated otherwise all files in this repository are licensed
 * under the Apache License Version 2.0.
 *
 * This product includes software developed at Datadog (https://www.datadoghq.com/).
 * Copyright 2019 Datadog, Inc.
 */

import * as Serverless from "serverless";
import * as layers from "./layers.json";

import { getConfig, setEnvConfiguration, forceExcludeDepsFromWebpack } from "./env";
import { applyLayers, findHandlers, FunctionInfo, RuntimeType } from "./layer";
import { enabledTracing } from "./tracing";
import { cleanupHandlers, writeHandlers } from "./wrapper";
import { hasWebpackPlugin } from "./util";

module.exports = class ServerlessPlugin {
  public hooks = {
    "after:datadog:clean:init": this.afterDeployFunction.bind(this),
    "after:datadog:generate:init": this.beforeDeployFunction.bind(this),
    "after:deploy:function:packageFunction": this.afterDeployFunction.bind(this),
    "after:invoke:local:invoke": this.afterDeployFunction.bind(this),
    "after:package:createDeploymentArtifacts": this.afterDeployFunction.bind(this),
    "after:package:initialize": this.beforeDeployFunction.bind(this),
    "before:deploy:function:packageFunction": this.beforeDeployFunction.bind(this),
    "before:invoke:local:invoke": this.beforeDeployFunction.bind(this),
    "before:offline:start:init": this.beforeDeployFunction.bind(this),
    "before:step-functions-offline:start": this.beforeDeployFunction.bind(this),
  };

  public commands = {
    datadog: {
      commands: {
        clean: {
          lifecycleEvents: ["init"],
          usage: "Cleans up wrapper handler functions for DataDog, not necessary in most cases",
        },
        generate: {
          lifecycleEvents: ["init"],
          usage: "Generates wrapper handler functions for DataDog, not necessary in most cases",
        },
      },
      lifecycleEvents: ["clean", "generate"],
      usage: "Automatically instruments your lambdas with DataDog",
    },
  };
  constructor(private serverless: Serverless, _: Serverless.Options) {}

  private async beforeDeployFunction() {
    this.serverless.cli.log("Auto instrumenting functions with Datadog");
    const config = getConfig(this.serverless.service);
    setEnvConfiguration(config, this.serverless.service);
    const defaultRuntime = this.serverless.service.provider.runtime;
    let defaultNodeRuntime: RuntimeType.NODE | RuntimeType.NODE_ES6 | RuntimeType.NODE_TS | undefined;
    switch (config.nodeModuleType) {
      case "es6":
        defaultNodeRuntime = RuntimeType.NODE_ES6;
        break;
      case "typescript":
        defaultNodeRuntime = RuntimeType.NODE_TS;
        break;
      case "node":
        defaultNodeRuntime = RuntimeType.NODE;
        break;
    }

    const handlers = findHandlers(this.serverless.service, defaultRuntime, defaultNodeRuntime);
    if (config.addLayers) {
      this.serverless.cli.log("Adding Lambda Layers to functions");
      this.debugLogHandlers(handlers);
      applyLayers(this.serverless.service.provider.region, handlers, layers);
      if (hasWebpackPlugin(this.serverless.service)) {
        forceExcludeDepsFromWebpack(this.serverless.service);
      }
    } else {
      this.serverless.cli.log("Skipping adding Lambda Layers, make sure you are packaging them yourself");
    }
    if (config.enableXrayTracing) {
      enabledTracing(this.serverless.service);
    }

    await writeHandlers(this.serverless.service, handlers, config.enableDDTracing);
  }
  private async afterDeployFunction() {
    this.serverless.cli.log("Cleaning up Datadog Handlers");
    await cleanupHandlers();
  }

  private debugLogHandlers(handlers: FunctionInfo[]) {
    for (const handler of handlers) {
      if (handler.type === RuntimeType.UNSUPPORTED) {
        if (handler.runtime === undefined) {
          this.serverless.cli.log(`Unable to determine runtime for function ${handler.name}`);
        } else {
          this.serverless.cli.log(
            `Unable to add Lambda Layers to function ${handler.name} with runtime ${handler.runtime}`,
          );
        }
      }
    }
  }
};
