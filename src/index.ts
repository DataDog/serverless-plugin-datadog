import * as Serverless from "serverless";

import * as layers from "./layers.json";
import { findHandlers, applyLayers } from "./layer";
import { enabledTracing } from "./tracing";
import { writeHandlers, cleanupHandlers } from "./wrapper";

module.exports = class ServerlessPlugin {
  public hooks = {
    "after:package:initialize": this.beforeDeployFunction.bind(this),
    "after:package:createDeploymentArtifacts": this.afterDeployFunction.bind(this),
    "before:deploy:function:packageFunction": this.beforeDeployFunction.bind(this),
    "after:deploy:function:packageFunction": this.afterDeployFunction.bind(this),
    "before:invoke:local:invoke": this.beforeDeployFunction.bind(this),
    "after:invoke:local:invoke": this.afterDeployFunction.bind(this),
    "before:offline:start:init": this.beforeDeployFunction.bind(this),
    "before:step-functions-offline:start": this.beforeDeployFunction.bind(this),
  };

  constructor(private serverless: Serverless, private options: Serverless.Options) {}

  private async beforeDeployFunction() {
    this.serverless.cli.log("Auto instrumenting functions with Datadog");
    const handlers = findHandlers(this.serverless.service);
    applyLayers(this.serverless.service.provider.region, handlers, layers);
    enabledTracing(this.serverless.service);
    const files = await writeHandlers(handlers);
    const service = this.serverless.service as any;
    if (service.package === undefined) {
      service.package = {};
    }
    const pack = service.package;
    if (pack.include === undefined) {
      pack.include = [];
    }
    pack.include.push(...files);
  }
  private async afterDeployFunction() {
    this.serverless.cli.log("Cleaning up Datadog Handlers");
    await cleanupHandlers();
  }
};
