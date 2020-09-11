/*
 * Unless explicitly stated otherwise all files in this repository are licensed
 * under the Apache License Version 2.0.
 *
 * This product includes software developed at Datadog (https://www.datadoghq.com/).
 * Copyright 2019 Datadog, Inc.
 */

import * as Serverless from "serverless";
import * as layers from "./layers.json";
import { version } from "../package.json";

import { getConfig, setEnvConfiguration } from "./env";
import { applyLayers, findHandlers, FunctionInfo, RuntimeType } from "./layer";
import { TracingMode, enableTracing } from "./tracing";
import { redirectHandlers } from "./wrapper";
import { addCloudWatchForwarderSubscriptions } from "./forwarder";
import { FunctionDefinition } from "serverless";

// Separate interface since DefinitelyTyped currently doesn't include tags or env
export interface ExtendedFunctionDefinition extends FunctionDefinition {
  tags?: { [key: string]: string };
  environment?: { [key: string]: string };
}

enum TagKeys {
  Service = "service",
  Env = "env",
  Plugin = "dd_sls_plugin",
}

module.exports = class ServerlessPlugin {
  public hooks = {
    "after:datadog:clean:init": this.afterPackageFunction.bind(this),
    "after:datadog:generate:init": this.beforePackageFunction.bind(this),
    "after:deploy:function:packageFunction": this.afterPackageFunction.bind(this),
    "after:package:createDeploymentArtifacts": this.afterPackageFunction.bind(this),
    "after:package:initialize": this.beforePackageFunction.bind(this),
    "before:deploy:function:packageFunction": this.beforePackageFunction.bind(this),
    "before:offline:start:init": this.beforePackageFunction.bind(this),
    "before:step-functions-offline:start": this.beforePackageFunction.bind(this),
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

  private async beforePackageFunction() {
    this.serverless.cli.log("Auto instrumenting functions with Datadog");
    const config = getConfig(this.serverless.service);
    setEnvConfiguration(config, this.serverless.service);

    const defaultRuntime = this.serverless.service.provider.runtime;
    const handlers = findHandlers(this.serverless.service, defaultRuntime);
    if (config.addLayers) {
      this.serverless.cli.log("Adding Lambda Layers to functions");
      this.debugLogHandlers(handlers);
      applyLayers(this.serverless.service.provider.region, handlers, layers);
    } else {
      this.serverless.cli.log("Skipping adding Lambda Layers, make sure you are packaging them yourself");
    }

    let tracingMode = TracingMode.NONE;
    if (config.enableXrayTracing && config.enableDDTracing) {
      tracingMode = TracingMode.HYBRID;
    } else if (config.enableDDTracing) {
      tracingMode = TracingMode.DD_TRACE;
    } else if (config.enableXrayTracing) {
      tracingMode = TracingMode.XRAY;
    }
    enableTracing(this.serverless.service, tracingMode);
  }
  private async afterPackageFunction() {
    const config = getConfig(this.serverless.service);
    if (config.forwarder) {
      const aws = this.serverless.getProvider("aws");
      const errors = await addCloudWatchForwarderSubscriptions(this.serverless.service, aws, config.forwarder);
      for (const error of errors) {
        this.serverless.cli.log(error);
      }
    }

    if (config.enableTags) {
      this.serverless.cli.log("Adding service and environment tags to functions");
      this.addServiceAndEnvTags();
      this.addPluginTag();
    }

    const defaultRuntime = this.serverless.service.provider.runtime;
    const handlers = findHandlers(this.serverless.service, defaultRuntime);
    redirectHandlers(handlers, config.addLayers);
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

  /**
   * Check for service and env tags on provider level (under tags and stackTags),
   * as well as function level. Automatically create tags for service and env with
   * properties from deployment configurations if needed; does not override any existing values.
   */
  private addServiceAndEnvTags() {
    let providerServiceTagExists = false;
    let providerEnvTagExists = false;

    const provider = this.serverless.service.provider as any;

    const providerTags = provider.tags;
    if (providerTags !== undefined) {
      providerServiceTagExists = providerTags[TagKeys.Service] !== undefined;
      providerEnvTagExists = providerTags[TagKeys.Env] !== undefined;
    }

    const providerStackTags = provider.stackTags;
    if (providerStackTags !== undefined) {
      providerServiceTagExists = providerServiceTagExists || providerStackTags[TagKeys.Service] !== undefined;
      providerEnvTagExists = providerEnvTagExists || providerStackTags[TagKeys.Env] !== undefined;
    }

    if (!providerServiceTagExists || !providerEnvTagExists) {
      this.serverless.service.getAllFunctions().forEach((functionName) => {
        const functionDefintion: ExtendedFunctionDefinition = this.serverless.service.getFunction(functionName);
        if (!functionDefintion.tags) {
          functionDefintion.tags = {};
        }
        if (!providerServiceTagExists && !functionDefintion.tags[TagKeys.Service]) {
          functionDefintion.tags[TagKeys.Service] = this.serverless.service.getServiceName();
        }
        if (!providerEnvTagExists && !functionDefintion.tags[TagKeys.Env]) {
          functionDefintion.tags[TagKeys.Env] = this.serverless.getProvider("aws").getStage();
        }
      });
    }
  }

  /**
   * Tags the function(s) with plugin version
   */
  private async addPluginTag() {
    this.serverless.cli.log(`Adding Plugin Version ${version}`);

    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionDefintion: ExtendedFunctionDefinition = this.serverless.service.getFunction(functionName);
      if (!functionDefintion.tags) {
        functionDefintion.tags = {};
      }

      functionDefintion.tags[TagKeys.Plugin] = version;
    });
  }
};
