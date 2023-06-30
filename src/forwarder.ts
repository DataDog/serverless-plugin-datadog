import Service from "serverless/classes/Service";
import { FunctionInfo } from "./layer";
import { version } from "../package.json";
import Serverless from "serverless";
import Aws = require("serverless/plugins/aws/provider/awsProvider");

const logGroupKey = "AWS::Logs::LogGroup";
const logGroupSubscriptionKey = "AWS::Logs::SubscriptionFilter";
const maxAllowableLogGroupSubscriptions: number = 2;

class DatadogForwarderNotFoundError extends Error {
  constructor(message: string) {
    super(...message);
    this.name = "DatadogForwarderNotFoundError";
    this.message = message;
  }
}

interface LogGroupResource {
  Type: typeof logGroupKey;
  Properties: {
    LogGroupName: string;
  };
}

interface ForwarderConfigs {
  AddExtension: boolean;
  TestingMode: boolean | undefined;
  IntegrationTesting: boolean | undefined;
  SubToAccessLogGroups: boolean;
  SubToExecutionLogGroups: boolean;
}
interface DescribeSubscriptionFiltersResponse {
  subscriptionFilters: {
    creationTime: number;
    destinationArn: string;
    distribution: string;
    filterName: string;
    filterPattern: string;
    logGroupName: string;
    roleArn: string;
  }[];
}

type SubLogsConfig =
  | boolean
  | {
      accessLogging: boolean | undefined;
      executionLogging: boolean | undefined;
    }
  | undefined;

type LogsConfig =
  | {
      restApi: SubLogsConfig;
      httpApi: SubLogsConfig;
      websocket: SubLogsConfig;
    }
  | undefined;

const REST_EXECUTION_LOG_GROUP_KEY = "RestExecutionLogGroup";
const REST_EXECUTION_SUBSCRIPTION_KEY = "RestExecutionLogGroupSubscription";
const WEBSOCKETS_EXECUTION_LOG_GROUP_KEY = "WebsocketsExecutionLogGroup";
const WEBSOCKETS_EXECUTION_SUBCRIPTION_KEY = "WebsocketsExecutionLogGroupSubscription";

// When users define ARN with CloudFormation functions, the ARN takes this type instead of a string.
export interface CloudFormationObjectArn {
  "Fn::Sub"?: string;
  "arn:aws"?: string;
}

function isLogGroup(value: any): value is LogGroupResource {
  return value.Type === logGroupKey;
}

/**
 * Validates whether Lambda forwarder exists in the account
 * @param aws Serverless framework provided AWS client
 * @param functionArn The forwarder ARN to be validated
 */
async function validateForwarderArn(aws: Aws, functionArn: CloudFormationObjectArn | string) {
  try {
    await aws.request("Lambda", "getFunction", { FunctionName: functionArn });
  } catch (err) {
    throw new DatadogForwarderNotFoundError(`Could not perform GetFunction on ${functionArn}.`);
  }
}

export async function addExecutionLogGroupsAndSubscriptions(
  service: Service,
  aws: Aws,
  functionArn: CloudFormationObjectArn | string,
) {
  const extendedProvider = (service.provider as any)?.logs;

  if (!isLogsConfig(extendedProvider)) {
    return;
  }

  const resources = service.provider.compiledCloudFormationTemplate?.Resources;
  if (restExecutionLoggingIsEnabled(extendedProvider)) {
    // create log group
    const logGroupName = await createRestExecutionLogGroupName(aws);
    const executionLogGroupName = addExecutionLogGroup(logGroupName);
    resources[REST_EXECUTION_LOG_GROUP_KEY] = executionLogGroupName;
    // add subscription
    const executionSubscription = subscribeToExecutionLogGroup(functionArn, REST_EXECUTION_LOG_GROUP_KEY);
    resources[REST_EXECUTION_SUBSCRIPTION_KEY] = executionSubscription;
  }

  if (websocketExecutionLoggingIsEnabled(extendedProvider)) {
    // create log group
    const logGroupName = await createWebsocketExecutionLogGroupName(aws);
    const executionLogGroupName = addExecutionLogGroup(logGroupName);
    // add subscription
    resources[WEBSOCKETS_EXECUTION_LOG_GROUP_KEY] = executionLogGroupName;
    const executionSubscription = subscribeToExecutionLogGroup(functionArn, WEBSOCKETS_EXECUTION_LOG_GROUP_KEY);
    resources[WEBSOCKETS_EXECUTION_SUBCRIPTION_KEY] = executionSubscription;
  }
}

export async function addStepFunctionLogGroup(aws: Aws, resources: any, stepFunction: any) {
  const stepFunctionName = stepFunction.name;
  const logGroupName = `/aws/vendedlogs/states/${stepFunctionName}-Logs-${aws.getStage()}`;
  const logGroupResourceName = `${normalizeResourceName(stepFunctionName)}LogGroup`;

  // create log group and add it to compiled CloudFormation template
  resources[logGroupResourceName] = {
    Type: logGroupKey,
    Properties: {
      LogGroupName: logGroupName,
      Tags: [{ Key: "dd_sls_plugin", Value: `v${version}` }],
    },
  };

  // add logging config to step function in serverless.yaml using newly created log group
  // the serverless-step-functions plugin handles the IAM policy creation for the adding logs to the log group
  stepFunction.loggingConfig = {
    level: "ALL",
    includeExecutionData: true,
    destinations: [{ "Fn::GetAtt": [logGroupResourceName, "Arn"] }],
  };
}

export function addDdSlsPluginTag(stateMachineObj: any) {
  if (stateMachineObj && stateMachineObj.Properties && !stateMachineObj.Properties.Tags) {
    stateMachineObj.Properties.Tags = [];
  }
  stateMachineObj.Properties?.Tags?.push({
    Key: "dd_sls_plugin",
    Value: `v${version}`,
  });
}

export function mergeStepFunctionsAndLambdaTraces(
  resources: { [key: string]: GeneralResource },
  serverless: Serverless,
) {
  for (const resourceName in resources) {
    if (resources.hasOwnProperty(resourceName)) {
      const resourceObj: GeneralResource = resources[resourceName];
      if (resourceObj.Type === "AWS::StepFunctions::StateMachine") {
        const definitionString = resourceObj.Properties?.DefinitionString;
        if (
          typeof definitionString === "object" &&
          "Fn::Sub" in definitionString &&
          definitionString["Fn::Sub"].length > 0
        ) {
          const unparsedDefinition = definitionString["Fn::Sub"][0];
          const definitionObj: StateMachineDefinition = JSON.parse(unparsedDefinition as string);

          const states = definitionObj.States;
          for (const stepName in states) {
            if (states.hasOwnProperty(stepName)) {
              const step: StateMachineStep = states[stepName];
              if (!isDefaultLambdaApiStep(step.Resource)) {
                continue;
              }
              if (typeof step.Parameters === "object") {
                if (step.Parameters.hasOwnProperty("Payload.$")) {
                  if (step.Parameters["Payload.$"] === "$") {
                    step.Parameters["Payload.$"] = "States.JsonMerge($$, $, false)";
                    serverless.cli.log(
                      `JsonMerge Step Functions context object with payload in step: ${stepName} of state machine: ${resourceName}.`,
                    );
                  }
                } else {
                  step.Parameters["Payload.$"] = "States.JsonMerge($$, $, false)";
                  serverless.cli.log(
                    `JsonMerge Step Functions context object with payload in step: ${stepName} of state machine: ${resourceName}.`,
                  );
                }
              }
            }
          }
          definitionString["Fn::Sub"][0] = JSON.stringify(definitionObj); // writing back to the original JSON created by Serverless framework
        } else {
          serverless.cli.log(
            `Step function definition not found in the first element of Properties.DefinitionString.Fn::Sub array of state machine: ${resourceName}.`,
          );
        }
      }
    }
  }
}

export async function addStepFunctionLogGroupSubscription(
  resources: any,
  stepFunction: any,
  functionArn: CloudFormationObjectArn | string,
) {
  const logGroupSubscriptionResourceName = `${normalizeResourceName(stepFunction.name)}LogGroupSubscription`;

  // parse log group name out of arn in logging config destination
  resources[logGroupSubscriptionResourceName] = {
    Type: logGroupSubscriptionKey,
    Properties: {
      DestinationArn: functionArn,
      FilterPattern: "",
      LogGroupName: {
        "Fn::Select": [
          6,
          {
            "Fn::Split": [":", stepFunction.loggingConfig.destinations[0]],
          },
        ],
      },
    },
  };
}

export async function addCloudWatchForwarderSubscriptions(
  service: Service,
  aws: Aws,
  functionArn: CloudFormationObjectArn | string,
  forwarderConfigs: ForwarderConfigs,
  handlers: FunctionInfo[],
) {
  const resources = service.provider.compiledCloudFormationTemplate?.Resources;
  if (resources === undefined) {
    return ["No cloudformation stack available. Skipping subscribing Datadog forwarder."];
  }
  const errors = [];
  if (typeof functionArn !== "string") {
    errors.push("Skipping forwarder ARN validation because forwarder string defined with CloudFormation function.");
  } else if (forwarderConfigs.TestingMode === true || forwarderConfigs.IntegrationTesting === true) {
    errors.push("Skipping forwarder ARN validation because 'testingMode' is set to true");
  } else {
    await validateForwarderArn(aws, functionArn);
  }
  for (const [name, resource] of Object.entries(resources)) {
    if (!shouldSubscribe(name, resource, forwarderConfigs, handlers, service)) {
      continue;
    }
    const logGroupName = resource.Properties.LogGroupName;
    const scopedSubName = `${name}Subscription`;

    let expectedSubName = `${service.getServiceName()}-${aws.getStage()}-${scopedSubName}-`;

    const stackName = aws.naming.getStackName();
    if (stackName) {
      expectedSubName = `${stackName}-${scopedSubName}-`;
    }

    const canSub = await canSubscribeLogGroup(aws, logGroupName, expectedSubName);
    if (!canSub) {
      errors.push(
        `Could not subscribe Datadog Forwarder due to too many existing subscription filter(s) for ${logGroupName}.`,
      );
      continue;
    }
    // Create subscriptions for each log group
    const subscription = subscribeToLogGroup(functionArn, name);
    resources[scopedSubName] = subscription;
  }

  return errors;
}

export async function canSubscribeLogGroup(aws: Aws, logGroupName: string, expectedSubName: string) {
  const subscriptionFilters = await describeSubscriptionFilters(aws, logGroupName);
  const numberOfActiveSubscriptionFilters: number = subscriptionFilters.length;
  let foundDatadogSubscriptionFilter: boolean = false;
  for (const subscription of subscriptionFilters) {
    const filterName = subscription.filterName;
    if (filterName.startsWith(expectedSubName)) {
      foundDatadogSubscriptionFilter = true;
    }
  }
  if (!foundDatadogSubscriptionFilter && numberOfActiveSubscriptionFilters >= maxAllowableLogGroupSubscriptions) {
    return false;
  } else {
    return true;
  }
}

export async function describeSubscriptionFilters(aws: Aws, logGroupName: string) {
  try {
    const result: DescribeSubscriptionFiltersResponse = await aws.request(
      "CloudWatchLogs",
      "describeSubscriptionFilters",
      {
        logGroupName,
      },
    );
    return result.subscriptionFilters;
  } catch (err) {
    // An error will occur if the log group doesn't exist, so we swallow this and return an empty list.
    return [];
  }
}

// Helper functions to validate we have a particular log group and if we should subscribe to it
function validateRestApiSubscription(resource: any, subscribe: boolean, extendedProvider: any) {
  return (
    restAccessLoggingIsEnabled(extendedProvider) &&
    resource.Properties.LogGroupName.startsWith("/aws/api-gateway/") &&
    subscribe
  );
}
function validateHttpApiSubscription(resource: any, subscribe: boolean, extendedProvider: any) {
  return (
    httpAccessLoggingIsEnabled(extendedProvider) &&
    resource.Properties.LogGroupName.startsWith("/aws/http-api/") &&
    subscribe
  );
}
function validateWebsocketSubscription(resource: any, subscribe: boolean, extendedProvider: any) {
  return (
    websocketAccessLoggingIsEnabled(extendedProvider) &&
    resource.Properties.LogGroupName.startsWith("/aws/websocket/") &&
    subscribe
  );
}

function shouldSubscribe(
  resourceName: string,
  resource: any,
  forwarderConfigs: ForwarderConfigs,
  handlers: FunctionInfo[],
  service: Service,
) {
  const extendedProvider = (service.provider as any)?.logs;
  if (!isLogGroup(resource)) {
    return false;
  }
  // we don't want to run the shouldSubscribe validation on execution log groups since we manually add those.
  if (typeof resource.Properties.LogGroupName !== "string") {
    return false;
  }
  /*
    Step function log groups created as custom resources in serverless.yml need to be subscribed to using the log group in
    the step function loggingConfig since custom resources are not in the complied cloudformation template until a later lifecycle event.

    Step function log groups created outside of serverless.yml need to be subscribed to using the log group in
    the step function loggingConfig since these log groups will never be in the compiled cloudformation template.

    Step function log groups created by this plugin are also subscribed to using the log group in the step function loggingConfig
    for consistency with step function log groups created with the above methods.
  */
  if (resource.Properties.LogGroupName.startsWith("/aws/vendedlogs/states/")) {
    return false;
  }
  // if the extension is enabled, we don't want to subscribe to lambda log groups
  if (
    forwarderConfigs.AddExtension &&
    !(
      validateRestApiSubscription(resource, forwarderConfigs.SubToAccessLogGroups, extendedProvider) ||
      validateHttpApiSubscription(resource, forwarderConfigs.SubToAccessLogGroups, extendedProvider) ||
      validateWebsocketSubscription(resource, forwarderConfigs.SubToAccessLogGroups, extendedProvider)
    )
  ) {
    return false;
  }
  // if the extension is disabled, we should subscribe to lambda log groups
  if (
    !(
      resource.Properties.LogGroupName.startsWith("/aws/lambda/") ||
      validateRestApiSubscription(resource, forwarderConfigs.SubToAccessLogGroups, extendedProvider) ||
      validateHttpApiSubscription(resource, forwarderConfigs.SubToAccessLogGroups, extendedProvider) ||
      validateWebsocketSubscription(resource, forwarderConfigs.SubToAccessLogGroups, extendedProvider)
    )
  ) {
    return true;
  }

  // If the log group does not belong to our list of handlers, we don't want to subscribe to it
  if (
    resource.Properties.LogGroupName.startsWith("/aws/lambda/") &&
    !handlers.some(({ name }) => getLogGroupLogicalId(name) === resourceName)
  ) {
    return false;
  }

  return true;
}

function subscribeToLogGroup(functionArn: string | CloudFormationObjectArn, name: string) {
  const subscription = {
    Type: logGroupSubscriptionKey,
    Properties: {
      DestinationArn: functionArn,
      FilterPattern: "",
      LogGroupName: { Ref: name },
    },
  };
  return subscription;
}

async function createRestExecutionLogGroupName(aws: Aws) {
  return {
    "Fn::Join": ["", ["API-Gateway-Execution-Logs_", { Ref: "ApiGatewayRestApi" }, "/", aws.getStage()]],
  };
}

async function createWebsocketExecutionLogGroupName(aws: Aws) {
  return {
    "Fn::Join": ["", ["/aws/apigateway/", { Ref: "WebsocketsApi" }, "/", aws.getStage()]],
  };
}

function addExecutionLogGroup(logGroupName: any) {
  // Create the Execution log group for API Gateway REST logging manually
  const executionLogGroup = {
    Type: "AWS::Logs::LogGroup",
    Properties: {
      LogGroupName: logGroupName,
    },
  };
  return executionLogGroup;
}

function subscribeToExecutionLogGroup(functionArn: string | CloudFormationObjectArn, executionLogGroupKey: string) {
  const executionSubscription = {
    Type: logGroupSubscriptionKey,
    Properties: {
      DestinationArn: functionArn,
      FilterPattern: "",
      LogGroupName: { Ref: executionLogGroupKey },
    },
  };
  return executionSubscription;
}

export function isLogsConfig(obj: any): obj is LogsConfig {
  if (typeof obj !== "object") {
    return false;
  }

  if (obj.hasOwnProperty("restApi")) {
    if (!isSubLogsConfig(obj.restApi)) {
      return false;
    }
  }

  if (obj.hasOwnProperty("httpApi")) {
    if (!isSubLogsConfig(obj.httpApi)) {
      return false;
    }
  }

  if (obj.hasOwnProperty("websocket")) {
    if (!isSubLogsConfig(obj.websocket)) {
      return false;
    }
  }
  return true;
}

function isSubLogsConfig(obj: any): obj is SubLogsConfig {
  if (typeof obj === "boolean") {
    return true;
  }
  if (typeof obj !== "object") {
    return false;
  }
  if (obj.hasOwnProperty("accessLogging")) {
    if (typeof obj.accessLogging !== "boolean" && typeof obj.accessLogging !== undefined) {
      return false;
    }
  }
  if (obj.hasOwnProperty("executionLogging")) {
    if (typeof obj.executionLogging !== "boolean" && typeof obj.executionLogging !== undefined) {
      return false;
    }
  }
  return true;
}

function restAccessLoggingIsEnabled(obj: LogsConfig) {
  if (obj?.restApi === false) {
    return false;
  }
  return obj?.restApi === true || obj?.restApi?.accessLogging === true;
}
function restExecutionLoggingIsEnabled(obj: LogsConfig) {
  if (obj?.restApi === false) {
    return false;
  }
  return obj?.restApi === true || obj?.restApi?.executionLogging === true;
}
function httpAccessLoggingIsEnabled(obj: LogsConfig) {
  if (obj?.httpApi === false) {
    return false;
  }
  return obj?.httpApi === true || obj?.httpApi?.accessLogging === true;
}

function websocketAccessLoggingIsEnabled(obj: LogsConfig) {
  if (obj?.websocket === false) {
    return false;
  }
  return obj?.websocket === true || obj?.websocket?.accessLogging === true;
}

function websocketExecutionLoggingIsEnabled(obj: LogsConfig) {
  if (obj?.websocket === false) {
    return false;
  }
  return obj?.websocket === true || obj?.websocket?.executionLogging === true;
}

// Created from https://github.com/serverless/serverless/blob/master/lib/plugins/aws/lib/naming.js#L125-L127
// Skipped lodash because Lambda Function Names can't include unicode chars or symbols
function getLogGroupLogicalId(functionName: string): string {
  if (!functionName) {
    return "";
  }
  const uppercasedFirst = functionName[0].toUpperCase();
  const rest = functionName.slice(1);
  const upperCasedFunctionName = uppercasedFirst + rest;
  const normalizedFunctionName = upperCasedFunctionName.replace(/-/g, "Dash").replace(/_/g, "Underscore");
  return `${normalizedFunctionName}LogGroup`;
}

// Resource names in CloudFormation Templates can only have alphanumeric characters
function normalizeResourceName(resourceName: string) {
  return resourceName.replace(/[^0-9a-z]/gi, "");
}

interface GeneralResource {
  Type: string;
  Properties?: {
    DefinitionString?: {
      "Fn::Sub": [string | object];
    };
  };
}

interface StateMachineDefinition {
  States: { [key: string]: StateMachineStep };
}

interface StateMachineStep {
  Resource: string;
  Parameters?: {
    FunctionName?: string;
    "Payload.$"?: string;
  };
  Next?: string;
  End?: boolean;
}

function isDefaultLambdaApiStep(resource: string): boolean {
  // default means not legacy lambda api
  if (resource == null) {
    return false;
  }
  if (resource === "arn:aws:states:::lambda:invoke") {
    // Legacy Lambda API resource.startsWith("arn:aws:lambda"), but it cannot inject context obj.
    return true;
  }
  return false;
}
