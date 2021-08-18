import { FunctionInfo } from "layer";
import Service from "serverless/classes/Service";
import Aws = require("serverless/plugins/aws/provider/awsProvider");
import Naming = require("serverless/lib/plugins/aws/lib/naming");

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
  IntegrationTesting: boolean | undefined;
  SubToApiGatewayLogGroup: boolean;
  SubToHttpApiLogGroup: boolean;
  SubToWebsocketLogGroup: boolean;
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
  } else if (forwarderConfigs.IntegrationTesting === true) {
    errors.push("Skipping forwarder ARN validation because 'integrationTesting' is set to true");
  } else {
    await validateForwarderArn(aws, functionArn);
  }
  for (const [name, resource] of Object.entries(resources)) {
    if (!shouldSubscribe(name, resource, forwarderConfigs, handlers)) {
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
    // Create the Execution log group for API Gateway logging manually so we can subscribe
    if (validateApiGatewaySubscription(resource, forwarderConfigs.SubToApiGatewayLogGroup)) {
      // add api gateway execution log group
      const executionLogGroup = createExecutionLogGroup(aws);
      const executionLogGroupKey = "ExecutionLogGroup";
      resources[executionLogGroupKey] = executionLogGroup;
      // add subscription to execution log group
      const executionSubscription = subscribeToExecutionLogGroup(functionArn);
      const executionSubscriptionKey = "ExecutionLogGroupSubscription";
      resources[executionSubscriptionKey] = executionSubscription;
    }
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
function validateApiGatewaySubscription(resource: any, subscribe: boolean) {
  return resource.Properties.LogGroupName.startsWith("/aws/api-gateway/") && subscribe;
}
function validateHttpApiSubscription(resource: any, subscribe: boolean) {
  return resource.Properties.LogGroupName.startsWith("/aws/http-api/") && subscribe;
}
function validateWebsocketSubscription(resource: any, subscribe: boolean) {
  return resource.Properties.LogGroupName.startsWith("/aws/websocket/") && subscribe;
}

function shouldSubscribe(
  resourceName: string,
  resource: any,
  forwarderConfigs: ForwarderConfigs,
  handlers: FunctionInfo[],
) {
  if (!isLogGroup(resource)) {
    return false;
  }

  // if the extension is enabled, we don't want to subscribe to lambda log groups
  if (
    forwarderConfigs.AddExtension &&
    !(
      validateApiGatewaySubscription(resource, forwarderConfigs.SubToApiGatewayLogGroup) ||
      validateHttpApiSubscription(resource, forwarderConfigs.SubToHttpApiLogGroup) ||
      validateWebsocketSubscription(resource, forwarderConfigs.SubToWebsocketLogGroup)
    )
  ) {
    return false;
  }
  // if the extension is disabled, we should subscribe to lambda log groups
  if (
    !(
      resource.Properties.LogGroupName.startsWith("/aws/lambda/") ||
      validateApiGatewaySubscription(resource, forwarderConfigs.SubToApiGatewayLogGroup) ||
      validateHttpApiSubscription(resource, forwarderConfigs.SubToHttpApiLogGroup) ||
      validateWebsocketSubscription(resource, forwarderConfigs.SubToWebsocketLogGroup)
    )
  ) {
    return false;
  }

  // If the log group does not belong to our list of handlers, we don't want to subscribe to it
  if (
    resource.Properties.LogGroupName.startsWith("/aws/lambda/") &&
    !handlers.some(({ name }) => Naming.getLogGroupLogicalId(name) === resourceName)
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
function createExecutionLogGroup(aws: Aws) {
  // Create the Execution log group for API Gateway logging manually
  const executionLogGroupName = {
    "Fn::Join": ["", ["API-Gateway-Execution-Logs_", { Ref: "ApiGatewayRestApi" }, "/", aws.getStage()]],
  };

  const executionLogGroup = {
    Type: "AWS::Logs::LogGroup",
    Properties: {
      LogGroupName: executionLogGroupName,
    },
  };
  return executionLogGroup;
}
function subscribeToExecutionLogGroup(functionArn: string | CloudFormationObjectArn) {
  const executionSubscription = {
    Type: logGroupSubscriptionKey,
    Properties: {
      DestinationArn: functionArn,
      FilterPattern: "",
      LogGroupName: { Ref: "ExecutionLogGroup" },
    },
  };
  return executionSubscription;
}
