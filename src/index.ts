import * as Serverless from "serverless";
import * as layers from "./layers.json";

import { applyLayers, findHandlers } from "./layer";
import { cleanupHandlers, writeHandlers } from "./wrapper";

import { enabledTracing } from "./tracing";

module.exports = class ServerlessPlugin {
  public hooks = {
    "after:deploy:function:packageFunction": this.afterDeployFunction.bind(this),
    "after:invoke:local:invoke": this.afterDeployFunction.bind(this),
    "after:package:createDeploymentArtifacts": this.afterDeployFunction.bind(this),
    "after:package:initialize": this.beforeDeployFunction.bind(this),
    "before:deploy:function:packageFunction": this.beforeDeployFunction.bind(this),
    "before:invoke:local:invoke": this.beforeDeployFunction.bind(this),
    "before:offline:start:init": this.beforeDeployFunction.bind(this),
    "before:step-functions-offline:start": this.beforeDeployFunction.bind(this),
  };

  constructor(private serverless: Serverless, private options: Serverless.Options) {}

  private async beforeDeployFunction() {
    this.serverless.cli.log("Auto instrumenting functions with Datadog");
    const handlers = findHandlers(this.serverless.service);
    applyLayers(this.serverless.service.provider.region, handlers, layers);
    enabledTracing(this.serverless.service);
    await writeHandlers(this.serverless.service, handlers);
  }
  private async afterDeployFunction() {
    this.serverless.cli.log("Cleaning up Datadog Handlers");
    await cleanupHandlers();
  }
};
