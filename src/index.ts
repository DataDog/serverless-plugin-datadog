/*
 * Unless explicitly stated otherwise all files in this repository are licensed
 * under the Apache License Version 2.0.
 *
 * This product includes software developed at Datadog (https://www.datadoghq.com/).
 * Copyright 2021 Datadog, Inc.
 */

import * as Serverless from "serverless";
import { FunctionDefinition } from "serverless";
import Service from "serverless/classes/Service";
import { Provider } from "serverless/plugins/aws/provider/awsProvider";
import { version } from "../package.json";
import { gitMetadata } from "@datadog/datadog-ci";
import {
  Configuration,
  ddEnvEnvVar,
  ddServiceEnvVar,
  ddTagsEnvVar,
  ddVersionEnvVar,
  forceExcludeDepsFromWebpack,
  getConfig,
  hasWebpackPlugin,
  setEnvConfiguration,
  setSourceCodeIntegrationEnvVar,
} from "./env";
import {
  addCloudWatchForwarderSubscriptions,
  addDdSlsPluginTag,
  addExecutionLogGroupsAndSubscriptions,
  addStepFunctionLogGroup,
  addStepFunctionLogGroupSubscription,
} from "./forwarder";
import { newSimpleGit } from "./git";
import {
  applyExtensionLayer,
  applyTracingLayer,
  applyLambdaLibraryLayers,
  findHandlers,
  FunctionInfo,
  RuntimeType,
} from "./layer";
import * as govLayers from "./layers-gov.json";
import * as layers from "./layers.json";
import { getCloudFormationStackId } from "./monitor-api-requests";
import { setMonitors } from "./monitors";
import { addOutputLinks, printOutputs } from "./output";
import { enableTracing, TracingMode } from "./tracing";
import { redirectHandlers } from "./wrapper";

// Separate interface since DefinitelyTyped currently doesn't include tags or env
export interface ExtendedFunctionDefinition extends FunctionDefinition {
  tags?: { [key: string]: string };
  environment?: { [key: string]: string };
}

enum TagKeys {
  Service = "service",
  Env = "env",
  Version = "version",
  Plugin = "dd_sls_plugin",
}

module.exports = class ServerlessPlugin {
  public hooks = {
    initialize: this.cliSharedInitialize.bind(this),
    "after:datadog:clean:init": this.afterPackageFunction.bind(this),
    "after:datadog:generate:init": this.beforePackageFunction.bind(this),
    "after:deploy:function:packageFunction": this.afterPackageFunction.bind(this),
    "after:package:createDeploymentArtifacts": this.afterPackageFunction.bind(this),
    "after:package:initialize": this.beforePackageFunction.bind(this),
    "after:package:compileFunctions": this.afterPackageCompileFunctions.bind(this),
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
  constructor(private serverless: Serverless, private options: Serverless.Options) {}

  private cliSharedInitialize() {
    if (this.options!.function) {
      this.serverless.cli.log(
        "Warning: Using serverless deploy -f option only updates the function code and will not update CloudFormation stack (env variables included).",
      );
    }
  }

  private async beforePackageFunction() {
    const config = getConfig(this.serverless.service);
    if (config.enabled === false) return;
    this.serverless.cli.log("Auto instrumenting functions with Datadog");
    configHasOldProperties(config);
    if (config.monitorsApiKey !== undefined || config.monitorsAppKey !== undefined) {
      this.serverless.cli.log(
        "Warning: `monitorsApiKey` and `monitorsAppKey` have been deprecated. Please set DATADOG_API_KEY and DATADOG_APP_KEY in your environment instead.",
      );
    }
    validateConfiguration(config);

    const defaultRuntime = this.serverless.service.provider.runtime;
    const handlers = findHandlers(this.serverless.service, config.exclude, defaultRuntime);

    setEnvConfiguration(config, handlers);

    const allLayers = { regions: { ...layers.regions, ...govLayers.regions } };
    const accountId = config.useLayersFromAccount;
    if (config.addLayers) {
      this.serverless.cli.log("Adding Lambda Library Layers to functions");
      this.debugLogHandlers(handlers);
      applyLambdaLibraryLayers(this.serverless.service, handlers, allLayers, accountId);
      if (hasWebpackPlugin(this.serverless.service)) {
        forceExcludeDepsFromWebpack(this.serverless.service);
      }
    } else {
      this.serverless.cli.log("Skipping adding Lambda Library Layers, make sure you are packaging them yourself");
    }

    if (config.addExtension) {
      this.serverless.cli.log("Adding Datadog Lambda Extension Layer to functions");
      this.debugLogHandlers(handlers);
      applyExtensionLayer(this.serverless.service, handlers, allLayers, accountId);
      handlers.forEach((functionInfo) => {
        if (functionInfo.type === RuntimeType.DOTNET || functionInfo.type === RuntimeType.JAVA) {
          const runtimeNameToReadable: { [key in RuntimeType.DOTNET | RuntimeType.JAVA]: string } = {
            [RuntimeType.DOTNET]: ".NET",
            [RuntimeType.JAVA]: "Java",
          };
          this.serverless.cli.log(`Adding ${runtimeNameToReadable[functionInfo.type]} Tracing Layer to functions`);
          this.debugLogHandlers(handlers);
          applyTracingLayer(this.serverless.service, functionInfo, allLayers, functionInfo.type, accountId);
        }
      });
    } else {
      this.serverless.cli.log("Skipping adding Lambda Extension Layer");
    }

    if (config.addExtension) {
      this.serverless.cli.log("Adding Datadog Env Vars");
      this.addDDEnvVars(handlers);
    } else {
      this.addDDTags(handlers);
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

  private async afterPackageCompileFunctions() {
    // State machines' "Properties" field will not be added until "after:package:compileFunctions"
    // hook. So we are updating Properties.Tag at this hook

    const resources = this.serverless.service.provider.compiledCloudFormationTemplate?.Resources;

    for (const [_, obj] of Object.entries(resources)) {
      if (obj.Type && obj.Type === "AWS::StepFunctions::StateMachine") {
        addDdSlsPluginTag(obj); // obj is a state machine object
      }
    }
  }

  private async afterPackageFunction() {
    const config = getConfig(this.serverless.service);
    if (config.enabled === false) return;

    // Create an object that contains some of our booleans for the forwarder
    const forwarderConfigs = {
      AddExtension: config.addExtension,
      TestingMode: config.testingMode,
      IntegrationTesting: config.integrationTesting,
      SubToAccessLogGroups: config.subscribeToAccessLogs,
      SubToExecutionLogGroups: config.subscribeToExecutionLogs,
      SubToStepFunctionLogGroups: config.subscribeToStepFunctionLogs,
    };

    const defaultRuntime = this.serverless.service.provider.runtime;
    const handlers = findHandlers(this.serverless.service, config.exclude, defaultRuntime);

    let datadogForwarderArn;
    datadogForwarderArn = this.setDatadogForwarder(config);
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

      if (config.subscribeToStepFunctionLogs) {
        const resources = this.serverless.service.provider.compiledCloudFormationTemplate?.Resources;
        const stepFunctions = Object.values((this.serverless.service as any).stepFunctions.stateMachines);
        if (stepFunctions.length === 0) {
          this.serverless.cli.log("subscribeToStepFunctionLogs is set to true but no step functions were found.");
        } else {
          this.serverless.cli.log("Subscribing step function log groups to Datadog Forwarder");
          for (const stepFunction of stepFunctions as any[]) {
            if (!stepFunction.hasOwnProperty("loggingConfig")) {
              this.serverless.cli.log(`Creating log group for ${stepFunction.name} and logging to it with level ALL.`);
              await addStepFunctionLogGroup(aws, resources, stepFunction);
            } else {
              this.serverless.cli.log(`Found logging config for step function ${stepFunction.name}`);
              const loggingConfig = stepFunction.loggingConfig;

              if (loggingConfig.level !== "ALL") {
                loggingConfig.level = "ALL";
                this.serverless.cli.log(
                  `Warning: Setting log level to ALL for step function ${stepFunction.name} so traces can be generated.`,
                );
              }
              if (loggingConfig.includeExecutionData !== true) {
                loggingConfig.includeExecutionData = true;
                this.serverless.cli.log(
                  `Warning: Setting includeExecutionData to true for step function ${stepFunction.name} so traces can be generated.`,
                );
              }
            }
            // subscribe step function log group to datadog forwarder regardless of how the log group was created
            await addStepFunctionLogGroupSubscription(resources, stepFunction, datadogForwarderArn);
          }
        }
      }
      for (const error of errors) {
        this.serverless.cli.log(error);
      }
    }

    if (datadogForwarderArn && config.addExtension) {
      this.serverless.cli.log(
        `Warning: Datadog Lambda Extension and forwarder are both enabled. Only APIGateway ${
          config.subscribeToStepFunctionLogs ? "and Step Function " : ""
        }log groups will be subscribed to the forwarder.`,
      );
    }

    this.addTags(handlers, config.addExtension !== true);

    if (config.enableSourceCodeIntegration) {
      this.serverless.cli.log(`Adding source code integration`);
      if ((process.env.DATADOG_API_KEY ?? config.apiKey) === undefined) {
        let keyError;
        if (config.apiKeySecretArn) {
          keyError = "encrypted credentials through KMS/Secrets Manager is not supported for this integration";
        } else {
          keyError = "Datadog credentials were not found";
        }
        this.serverless.cli.log(
          `Skipping enabling source code integration because ${keyError}. Please set either DATADOG_API_KEY in your environment, or set the apiKey parameter in Serverless.`,
        );
      } else {
        const simpleGit = await newSimpleGit();
        if (simpleGit !== undefined && (await simpleGit.checkIsRepo())) {
          try {
            const [gitRemote, gitHash] = await gitMetadata.getGitCommitInfo();
            handlers.forEach(({ handler }) => {
              setSourceCodeIntegrationEnvVar(handler, gitHash, gitRemote);
            });
            if (config.uploadGitMetadata) {
              this.serverless.cli.log(`Uploading git metadata`);
              await gitMetadata.uploadGitCommitHash((process.env.DATADOG_API_KEY ?? config.apiKey)!, config.site);
            }
          } catch (err) {
            this.serverless.cli.log(`Error occurred when adding source code integration: ${err}`);
          }
        }
      }
    }

    redirectHandlers(handlers, config.addLayers, config.customHandler);
    if ((config.testingMode === false || config.integrationTesting === false) && config.skipCloudformationOutputs === false) {
      await addOutputLinks(this.serverless, config.site, config.subdomain, handlers);
    } else {
      this.serverless.cli.log("Skipped adding output links");
    }
  }

  private async afterDeploy() {
    const config = getConfig(this.serverless.service);
    const custom = (this.serverless.service.custom ?? {}) as any;
    const service = custom.datadog?.service ?? this.serverless.service.getServiceName();
    const env = custom.datadog?.env ?? this.serverless.getProvider("aws").getStage();

    if (config.enabled === false) return;
    if (
      config.monitors &&
      (config.apiKey ?? process.env.DATADOG_API_KEY) &&
      (config.appKey ?? process.env.DATADOG_APP_KEY)
    ) {
      const cloudFormationStackId = await getCloudFormationStackId(this.serverless);
      try {
        const logStatements = await setMonitors(
          config.site,
          config.monitors,
          (config.apiKey ?? process.env.DATADOG_API_KEY)!,
          (config.appKey ?? process.env.DATADOG_APP_KEY)!,
          cloudFormationStackId,
          service,
          env,
        );
        for (const logStatement of logStatements) {
          this.serverless.cli.log(logStatement);
        }
      } catch (err) {
        if (err instanceof Error) {
          this.serverless.cli.log(`Error occurred when configuring monitors: ${err.message}`);
          if (config.failOnError) {
            throw err;
          }
        }
      }
    }
    return printOutputs(this.serverless, config.site, config.subdomain, service, env);
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
   * Check for service, env, version, and additional tags at the custom level.
   * If these don't already exsist on the function level as env vars, adds them as DD_XXX env vars
   */
  private addDDEnvVars(handlers: FunctionInfo[]) {
    const provider = this.serverless.service.provider as Provider;
    const service = this.serverless.service as Service;

    let custom = service.custom as any;
    if (custom === undefined) {
      custom = {};
    }

    handlers.forEach(({ handler }) => {
      handler.environment ??= {};
      const environment = handler.environment as any;
      provider.environment ??= {};
      const providerEnvironment = provider.environment as any;

      if (custom?.datadog?.service) {
        environment[ddServiceEnvVar] ??= providerEnvironment[ddServiceEnvVar] ?? custom.datadog.service;
      }

      if (custom?.datadog?.env) {
        environment[ddEnvEnvVar] ??= providerEnvironment[ddEnvEnvVar] ?? custom.datadog.env;
      }

      if (custom?.datadog?.version) {
        environment[ddVersionEnvVar] ??= providerEnvironment[ddVersionEnvVar] ?? custom.datadog.version;
      }

      if (custom?.datadog?.tags) {
        environment[ddTagsEnvVar] ??= providerEnvironment[ddTagsEnvVar] ?? custom.datadog.tags;
      }

      // default to service and stage if env vars aren't set
      environment[ddServiceEnvVar] ??= service.getServiceName();
      environment[ddEnvEnvVar] ??= this.serverless.getProvider("aws").getStage();
    });
  }

  /**
   * Check for service, env, version, and additional tags at the custom level.
   * If these tags don't already exsist on the function level, adds them as tags
   */
  private addDDTags(handlers: FunctionInfo[]) {
    const service = this.serverless.service as Service;

    let custom = service.custom as any;
    if (custom === undefined) {
      custom = {};
    }

    handlers.forEach(({ handler }) => {
      handler.tags ??= {};
      const tags = handler.tags as any;

      if (custom?.datadog?.service) {
        tags[TagKeys.Service] ??= custom.datadog.service;
      }

      if (custom?.datadog?.env) {
        tags[TagKeys.Env] ??= custom.datadog.env;
      }

      if (custom?.datadog?.version) {
        tags[TagKeys.Version] ??= custom.datadog.version;
      }

      if (custom?.datadog?.tags) {
        const tagsArray = custom.datadog.tags.split(",");
        tagsArray.forEach((tag: string) => {
          const [key, value] = tag.split(":");
          if (key && value) {
            tags[key] ??= value;
          }
        });
      }
    });
  }

  /**
   * Check for service and env tags on provider level (under tags and stackTags),
   * as well as function level. Automatically create tags for service and env with
   * properties from deployment configurations if needed; does not override any existing values.
   */
  private addTags(handlers: FunctionInfo[], shouldAddTags: boolean) {
    const provider = this.serverless.service.provider as Provider;
    this.serverless.cli.log(`Adding Plugin Version ${version} tag`);

    if (shouldAddTags) {
      this.serverless.cli.log(`Adding service and environment tags`);
    }

    handlers.forEach(({ handler }) => {
      handler.tags ??= {};

      handler.tags[TagKeys.Plugin] = `v${version}`;

      if (shouldAddTags) {
        if (!provider.tags?.[TagKeys.Service] && !provider.stackTags?.[TagKeys.Service]) {
          handler.tags[TagKeys.Service] ??= this.serverless.service.getServiceName();
        }

        if (!provider.tags?.[TagKeys.Env] && !provider.stackTags?.[TagKeys.Env]) {
          handler.tags[TagKeys.Env] ??= this.serverless.getProvider("aws").getStage();
        }
      }
    });
  }

  private setDatadogForwarder(config: Configuration) {
    const forwarderArn: string | undefined = config.forwarderArn;
    const forwarder: string | undefined = config.forwarder;
    if (forwarderArn && forwarder) {
      throw new Error(
        "Both 'forwarderArn' and 'forwarder' parameters are set. Please only use the 'forwarderArn' parameter.",
      );
    } else if (forwarderArn !== undefined && forwarder === undefined) {
      this.serverless.cli.log("Setting Datadog Forwarder");
      return forwarderArn;
    } else if (forwarder !== undefined && forwarderArn === undefined) {
      this.serverless.cli.log("Setting Datadog Forwarder");
      return forwarder;
    }
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
    "ap1.datadoghq.com",
    "ddog-gov.com",
  ];
  if (!config.testingMode && config.site !== undefined && !siteList.includes(config.site.toLowerCase())) {
    throw new Error(
      "Warning: Invalid site URL. Must be either datadoghq.com, datadoghq.eu, us3.datadoghq.com, us5.datadoghq.com, ap1.datadoghq.com, or ddog-gov.com.",
    );
  }
  if (config.addExtension) {
    if (
      config.apiKey === undefined &&
      process.env.DATADOG_API_KEY === undefined &&
      config.apiKMSKey === undefined &&
      config.apiKeySecretArn === undefined
    ) {
      throw new Error(
        "When `addExtension` is true, the environment variable `DATADOG_API_KEY` or configuration variable `apiKMSKey` or `apiKeySecretArn` must be set.",
      );
    }
  }
  if (config.monitors) {
    if (
      (process.env.DATADOG_API_KEY === undefined || process.env.DATADOG_APP_KEY === undefined) &&
      // Support deprecated monitorsApiKey and monitorsAppKey
      (config.apiKey === undefined || config.appKey === undefined) &&
      (config.testingMode === false || config.integrationTesting === false)
    ) {
      throw new Error(
        "When `monitors` is enabled, `DATADOG_API_KEY` and `DATADOG_APP_KEY` environment variables must be set.",
      );
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
