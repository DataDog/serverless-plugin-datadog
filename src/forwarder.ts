import Service from "serverless/classes/Service";

const logGroupKey = "AWS::Logs::LogGroup";
const logGroupSubscriptionKey = "AWS::Logs::SubscriptionFilter";

interface LogGroupResource {
  Type: typeof logGroupKey;
  Properties: {
    LogGroupName: string;
  };
}

function isLogGroup(value: any): value is LogGroupResource {
  return value.Type === logGroupKey;
}

export function addCloudWatchForwarderSubscriptions(service: Service, functionArn: string) {
  const resources = service.provider.compiledCloudFormationTemplate.Resources;

  for (const [name, resource] of Object.entries(resources)) {
    if (!isLogGroup(resource)) {
      continue;
    }
    const subscription = {
      Type: logGroupSubscriptionKey,
      Properties: {
        DestinationArn: functionArn,
        FilterPattern: "",
        LogGroupName: { Ref: name },
      },
    };
    resources[`${name}Subscription`] = subscription;
  }
}
