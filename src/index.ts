import * as Serverless from "serverless";

import * as layers from "./layers.json";
import { findHandlers, applyLayers } from "./layer.js";
import { enabledTracing } from "./tracing.js";

module.exports = class ServerlessPlugin {
  public hooks = {
    "after:package:initialize": this.beforeDeployFunction.bind(this),
    "before:deploy:function:packageFunction": this.beforeDeployFunction.bind(this),
    "before:invoke:local:invoke": this.beforeDeployFunction.bind(this),
    "before:offline:start:init": this.beforeDeployFunction.bind(this),
    "before:step-functions-offline:start": this.beforeDeployFunction.bind(this),
  };

  constructor(private serverless: Serverless, private options: Serverless.Options) {}

  private beforeDeployFunction() {
    this.serverless.cli.log("Auto instrumenting functions with Datadog");
    const handlers = findHandlers(this.serverless.service);
    applyLayers(this.serverless.service.provider.region, handlers, layers);
    enabledTracing(this.serverless.service);
  }
};
