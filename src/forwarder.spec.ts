import Service from "serverless/classes/Service";
import { addCloudWatchForwarderSubscriptions } from "./forwarder";

function serviceWithResources(resources: Record<string, any>): Service {
  const service: Partial<Service> = {
    provider: {
      name: "",
      stage: "",
      region: "",
      versionFunctions: true,
      compiledCloudFormationTemplate: {
        Resources: resources,
        Outputs: {},
      },
    },
  };
  return service as Service;
}

describe("addCloudWatchForwarderSubscriptions", () => {
  it("adds a subscription for each log group", () => {
    const service = serviceWithResources({
      FirstGroup: {
        Type: "AWS::Logs::LogGroup",
        Properties: {
          LogGroupName: "/aws/lambda/first-group",
        },
      },
      SecondGroup: {
        Type: "AWS::Logs::LogGroup",
        Properties: {
          LogGroupName: "/aws/lambda/second-group",
        },
      },
      UnrelatedResource: {
        Type: "AWS::AnotherResourceType",
        Properties: {},
      },
    });

    addCloudWatchForwarderSubscriptions(service as Service, "my-func");
    expect(service.provider.compiledCloudFormationTemplate.Resources).toMatchInlineSnapshot(`
      Object {
        "FirstGroup": Object {
          "Properties": Object {
            "LogGroupName": "/aws/lambda/first-group",
          },
          "Type": "AWS::Logs::LogGroup",
        },
        "FirstGroupSubscription": Object {
          "Properties": Object {
            "DestinationArn": "my-func",
            "FilterPattern": "",
            "LogGroupName": Object {
              "Ref": "FirstGroup",
            },
          },
          "Type": "AWS::Logs::SubscriptionFilter",
        },
        "SecondGroup": Object {
          "Properties": Object {
            "LogGroupName": "/aws/lambda/second-group",
          },
          "Type": "AWS::Logs::LogGroup",
        },
        "SecondGroupSubscription": Object {
          "Properties": Object {
            "DestinationArn": "my-func",
            "FilterPattern": "",
            "LogGroupName": Object {
              "Ref": "SecondGroup",
            },
          },
          "Type": "AWS::Logs::SubscriptionFilter",
        },
        "UnrelatedResource": Object {
          "Properties": Object {},
          "Type": "AWS::AnotherResourceType",
        },
      }
    `);
  });
});
