import Service from "serverless/classes/Service";

const LogGroupKey = "AWS::Logs::LogGroup";
const LogGroupSubscriptionKey = "AWS::Logs::SubscriptionFilter";

interface LogGroupResource {
  Type: typeof LogGroupKey;
  Properties: {
    LogGroupName: string;
  };
}

function isLogGroup(value: any): value is LogGroupResource {
  return value.Type === LogGroupKey;
}

export function addCloudWatchForwarderSubscriptions(service: Service, functionArn: string) {
  const resources = service.provider.compiledCloudFormationTemplate.Resources;

  for (const [name, resource] of Object.entries(resources)) {
    if (!isLogGroup(resource)) {
      continue;
    }
    const subscription = {
      Type: LogGroupSubscriptionKey,
      Properties: {
        DestinationArn: functionArn,
        FilterPattern: "",
        LogGroupName: { Ref: name },
      },
    };
    resources[`${name}Subscription`] = subscription;
  }
}
