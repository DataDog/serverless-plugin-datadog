/*
 * Unless explicitly stated otherwise all files in this repository are licensed
 * under the Apache License Version 2.0.
 *
 * This product includes software developed at Datadog (https://www.datadoghq.com/).
 * Copyright 2021 Datadog, Inc.
 */

import * as Serverless from "serverless";
import * as layers from "./layers.json";
import * as govLayers from "./layers-gov.json";
import { version } from "../package.json";

import { getConfig, setEnvConfiguration, forceExcludeDepsFromWebpack, hasWebpackPlugin, Configuration } from "./env";
import { applyExtensionLayer, applyLambdaLibraryLayers, findHandlers, FunctionInfo, RuntimeType } from "./layer";
import { TracingMode, enableTracing } from "./tracing";
import { redirectHandlers } from "./wrapper";
import { addCloudWatchForwarderSubscriptions, addExecutionLogGroupsAndSubscriptions } from "./forwarder";
import { addOutputLinks, printOutputs } from "./output";
import { FunctionDefinition } from "serverless";
import { setMonitors } from "./monitors";
import { getCloudFormationStackId } from "./monitor-api-requests";

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
    "after:deploy:deploy": this.afterDeploy.bind(this),
    "before:package:finalize": this.afterPackageFunction.bind(this),
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
    const config = getConfig(this.serverless.service);
    if (config.enabled === false) return;
    this.serverless.cli.log("Auto instrumenting functions with Datadog");
    configHasOldProperties(config);
    validateConfiguration(config);

    const defaultRuntime = this.serverless.service.provider.runtime;
    const handlers = findHandlers(this.serverless.service, config.exclude, defaultRuntime);

    setEnvConfiguration(config, handlers);

    const allLayers = { regions: { ...layers.regions, ...govLayers.regions } };
    if (config.addLayers) {
      this.serverless.cli.log("Adding Lambda Library Layers to functions");
      this.debugLogHandlers(handlers);
      applyLambdaLibraryLayers(this.serverless.service, handlers, allLayers);
      if (hasWebpackPlugin(this.serverless.service)) {
        forceExcludeDepsFromWebpack(this.serverless.service);
      }
    } else {
      this.serverless.cli.log("Skipping adding Lambda Library Layers, make sure you are packaging them yourself");
    }

    if (config.addExtension) {
      this.serverless.cli.log("Adding Datadog Lambda Extension Layer to functions");
      this.debugLogHandlers(handlers);
      applyExtensionLayer(this.serverless.service, handlers, allLayers);
    } else {
      this.serverless.cli.log("Skipping adding Lambda Extension Layer");
    }

    let tracingMode = TracingMode.NONE;
    if (config.enableXrayTracing && config.enableDDTracing) {
      tracingMode = TracingMode.HYBRID;
    } else if (config.enableDDTracing) {
      tracingMode = TracingMode.DD_TRACE;
    } else if (config.enableXrayTracing) {
      tracingMode = TracingMode.XRAY;
    }
    enableTracing(this.serverless.service, tracingMode, handlers);
  }

  private async afterPackageFunction() {
    const config = getConfig(this.serverless.service);
    if (config.enabled === false) return;

    // Create an object that contains some of our booleans for the forwarder
    const forwarderConfigs = {
      AddExtension: config.addExtension,
      IntegrationTesting: config.integrationTesting,
      SubToAccessLogGroups: config.subscribeToAccessLogs,
      SubToExecutionLogGroups: config.subscribeToExecutionLogs,
    };

    const defaultRuntime = this.serverless.service.provider.runtime;
    const handlers = findHandlers(this.serverless.service, config.exclude, defaultRuntime);

    let datadogForwarderArn;
    datadogForwarderArn = setDatadogForwarder(config);
    this.serverless.cli.log("Setting Datadog Forwarder");
    if (datadogForwarderArn) {
      const aws = this.serverless.getProvider("aws");
      const errors = await addCloudWatchForwarderSubscriptions(
        this.serverless.service,
        aws,
        datadogForwarderArn,
        forwarderConfigs,
        handlers,
      );
      if (config.subscribeToExecutionLogs) {
        await addExecutionLogGroupsAndSubscriptions(this.serverless.service, aws, datadogForwarderArn);
      }
      for (const error of errors) {
        this.serverless.cli.log(error);
      }
    }

    this.addTags(handlers, config.enableTags);

    redirectHandlers(handlers, config.addLayers, config.customHandler);
    if (config.integrationTesting === false) {
      await addOutputLinks(this.serverless, config.site, handlers);
    } else {
      this.serverless.cli.log("Skipped adding output links because 'integrationTesting' is set true");
    }
  }

  private async afterDeploy() {
    const config = getConfig(this.serverless.service);
    const service = this.serverless.service.getServiceName();
    const env = this.serverless.getProvider("aws").getStage();

    if (config.enabled === false) return;
    if (config.monitors && config.monitorsApiKey && config.monitorsAppKey) {
      const cloudFormationStackId = await getCloudFormationStackId(this.serverless);
      try {
        const logStatements = await setMonitors(
          config.site,
          config.monitors,
          config.monitorsApiKey,
          config.monitorsAppKey,
          cloudFormationStackId,
          service,
          env,
        );
        for (const logStatement of logStatements) {
          this.serverless.cli.log(logStatement);
        }
      } catch (err) {
        this.serverless.cli.log("Error occurred when configuring monitors.");
      }
    }
    return printOutputs(this.serverless, config.site);
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
  private addTags(handlers: FunctionInfo[], enableTags: boolean) {
    const provider = this.serverless.service.provider as any;
    this.serverless.cli.log(`Adding Plugin Version ${version} tag`);

    if (enableTags) {
      this.serverless.cli.log(`Adding service and environment tags`);
    }

    handlers.forEach(({ handler }) => {
      handler.tags ??= {};

      handler.tags[TagKeys.Plugin] = `v${version}`;

      if (enableTags) {
        if (!provider.tags?.[TagKeys.Service] && !provider.stackTags?.[TagKeys.Service]) {
          handler.tags[TagKeys.Service] ??= this.serverless.service.getServiceName();
        }

        if (!provider.tags?.[TagKeys.Env] && !provider.stackTags?.[TagKeys.Env]) {
          handler.tags[TagKeys.Env] ??= this.serverless.getProvider("aws").getStage();
        }
      }
    });
  }
};

function configHasOldProperties(obj: any) {
  let hasOldProperties = false;
  let message = "The following configuration options have been removed:";

  if (obj.subscribeToApiGatewayLogs) {
    message += " subscribeToApiGatewayLogs";
    hasOldProperties = true;
  }
  if (obj.subscribeToHttpApiLogs) {
    message += " subscribeToHttpApiLogs";
    hasOldProperties = true;
  }

  if (obj.subscribeToWebsocketLogs) {
    message += " subscribeToWebsocketLogs";
    hasOldProperties = true;
  }

  if (hasOldProperties) {
    throw new Error(message + ". Please use the subscribeToAccessLogs or subscribeToExecutionLogs options instead.");
  }
}

function validateConfiguration(config: Configuration) {
  checkForMultipleApiKeys(config);

  const siteList: string[] = [
    "datadoghq.com",
    "datadoghq.eu",
    "us3.datadoghq.com",
    "us5.datadoghq.com",
    "ddog-gov.com",
  ];
  if (config.site !== undefined && !siteList.includes(config.site.toLowerCase())) {
    throw new Error(
      "Warning: Invalid site URL. Must be either datadoghq.com, datadoghq.eu, us3.datadoghq.com, us5.datadoghq.com, or ddog-gov.com.",
    );
  }
  if (config.addExtension) {
    if (config.apiKey === undefined && config.apiKMSKey === undefined && config.apiKeySecretArn === undefined) {
      throw new Error("When `addExtension` is true, `apiKey`, `apiKMSKey`, or `apiKeySecretArn` must also be set.");
    }
  }
  if (config.monitors) {
    if (config.monitorsApiKey === undefined || config.monitorsAppKey === undefined) {
      throw new Error("When `monitors` is defined, `monitorsApiKey` and `monitorsAppKey` must also be defined");
    }
  }
}

function checkForMultipleApiKeys(config: Configuration) {
  let multipleApiKeysMessage;
  if (config.apiKey !== undefined && config.apiKMSKey !== undefined && config.apiKeySecretArn !== undefined) {
    multipleApiKeysMessage = "`apiKey`, `apiKMSKey`, and `apiKeySecretArn`";
  } else if (config.apiKey !== undefined && config.apiKMSKey !== undefined) {
    multipleApiKeysMessage = "`apiKey` and `apiKMSKey`";
  } else if (config.apiKey !== undefined && config.apiKeySecretArn !== undefined) {
    multipleApiKeysMessage = "`apiKey` and `apiKeySecretArn`";
  } else if (config.apiKMSKey !== undefined && config.apiKeySecretArn !== undefined) {
    multipleApiKeysMessage = "`apiKMSKey` and `apiKeySecretArn`";
  }

  if (multipleApiKeysMessage) {
    throw new Error(`${multipleApiKeysMessage} should not be set at the same time.`);
  }
}

function setDatadogForwarder(config: Configuration) {
  const forwarderArn: string | undefined = config.forwarderArn;
  const forwarder: string | undefined = config.forwarder;
  if (forwarderArn && forwarder) {
    throw new Error(
      "Both 'forwarderArn' and 'forwarder' parameters are set. Please only use the 'forwarderArn' parameter.",
    );
  } else if (forwarderArn !== undefined && forwarder === undefined) {
    return forwarderArn;
  } else if (forwarder !== undefined && forwarderArn === undefined) {
    return forwarder;
  }
}
