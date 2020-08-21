import Service from "serverless/classes/Service";
import { addCloudWatchForwarderSubscriptions } from "./forwarder";
import Aws from "serverless/plugins/aws/provider/awsProvider";

function serviceWithResources(resources?: Record<string, any>, serviceName = "my-service"): Service {
  const service: Partial<Service> = {
    getServiceName: () => serviceName,
    provider: {
      name: "",
      stage: "",
      region: "",
      versionFunctions: true,
      compiledCloudFormationTemplate: {
        Resources: resources as any,
        Outputs: {},
      },
    },
  };
  return service as Service;
}

function awsMock(existingSubs: { [key: string]: any }): Aws {
  return {
    getStage: () => "dev",
    request: (service, method, params: any) => {
      const logGroupName = params.logGroupName;
      if (existingSubs[logGroupName]) {
        return Promise.resolve({ subscriptionFilters: existingSubs[logGroupName] });
      }
      return Promise.reject("Log group doesn't exist");
    },
  } as Aws;
}

describe("addCloudWatchForwarderSubscriptions", () => {
  it("adds a subscription for each log group", async () => {
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
      NonLambdaGroup: {
        Type: "AWS::Logs::LogGroup",
        Properties: {
          LogGroupName: "/aws/apigateway/second-group",
        },
      },
      UnrelatedResource: {
        Type: "AWS::AnotherResourceType",
        Properties: {},
      },
    });

    const aws = awsMock({});

    await addCloudWatchForwarderSubscriptions(service as Service, aws, "my-func");
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
        "NonLambdaGroup": Object {
          "Properties": Object {
            "LogGroupName": "/aws/apigateway/second-group",
          },
          "Type": "AWS::Logs::LogGroup",
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

  it("doesn't add subscription when an unknown subscription already exists", async () => {
    const service = serviceWithResources({
      FirstGroup: {
        Type: "AWS::Logs::LogGroup",
        Properties: {
          LogGroupName: "/aws/lambda/first-group",
        },
      },
    });

    const aws = awsMock({ "/aws/lambda/first-group": [{ filterName: "unknown-filter-name" }] });

    await addCloudWatchForwarderSubscriptions(service as Service, aws, "my-func");
    expect(service.provider.compiledCloudFormationTemplate.Resources).toMatchInlineSnapshot(`
      Object {
        "FirstGroup": Object {
          "Properties": Object {
            "LogGroupName": "/aws/lambda/first-group",
          },
          "Type": "AWS::Logs::LogGroup",
        },
      }
    `);
  });
  it("doesn't add subscription when cloudformation stack isn't available", async () => {
    const service = serviceWithResources(undefined);

    const aws = awsMock({});

    const errors = await addCloudWatchForwarderSubscriptions(service as Service, aws, "my-func");
    expect(errors).toMatchInlineSnapshot(`
      Array [
        "No cloudformation stack available. Skipping subscribing Datadog forwarder.",
      ]
    `);
  });
  it("adds a subscription when an known subscription already exists", async () => {
    const service = serviceWithResources(
      {
        FirstGroup: {
          Type: "AWS::Logs::LogGroup",
          Properties: {
            LogGroupName: "/aws/lambda/first-group",
          },
        },
      },
      "my-service",
    );

    const aws = awsMock({ "/aws/lambda/first-group": [{ filterName: "my-service-dev-FirstGroupSubscription-XXXX" }] });

    await addCloudWatchForwarderSubscriptions(service as Service, aws, "my-func");
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
      }
    `);
  });
});
