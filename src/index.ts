import * as Serverless from "serverless";
import * as layers from "./layers.json";

import { applyLayers, findHandlers } from "./layer";
import { cleanupHandlers, writeHandlers } from "./wrapper";

import { enabledTracing } from "./tracing";
import { getConfig, setEnvConfiguration } from "./env";

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

    const handlers = findHandlers(this.serverless.service);
    if (config.addLayers) {
      this.serverless.cli.log("Adding Lambda Layers to functions");
      applyLayers(this.serverless.service.provider.region, handlers, layers);
    } else {
      this.serverless.cli.log("Skipping adding Lambda Layers, make sure you are packaging them yourself");
    }
    enabledTracing(this.serverless.service);
    await writeHandlers(this.serverless.service, handlers);
  }
  private async afterDeployFunction() {
    this.serverless.cli.log("Cleaning up Datadog Handlers");
    await cleanupHandlers();
  }
};
