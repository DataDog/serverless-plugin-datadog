import Service from "serverless/classes/Service";
import { addCloudWatchForwarderSubscriptions } from "./forwarder";
import { canSubscribeLogGroup } from "./forwarder";
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

function awsMock(existingSubs: { [key: string]: any }, stackName?: string): Aws {
  return {
    getStage: () => "dev",
    request: (service, method, params: any) => {
      const logGroupName = params.logGroupName;
      if (existingSubs[logGroupName]) {
        return Promise.resolve({ subscriptionFilters: existingSubs[logGroupName] });
      }
      return Promise.reject("Log group doesn't exist");
    },
    naming: {
      getStackName: () => stackName,
    } as { [key: string]: () => string },
  } as Aws;
}

describe("canSubscribeLogGroup",() => {
  it("tells addCloudWatchForwarderSubscriptions function it can subscribe to a given log group with 0 existing subscription filters", async() => {

   const aws = awsMock({});
   const logGroupName: string = "/aws/lambda/serverless-plugin-test-dev-hello";
   const expectedSubName: string = "serverless-plugin-test-dev-HelloLogGroupSubscription";

   const canSubscribe = await canSubscribeLogGroup(aws,logGroupName,expectedSubName);
   expect(canSubscribe).toBeTruthy();

  });
  it("tells addCloudWatchForwarderSubscriptions function it can subscribe to a given log group with 1 existing subscription that belongs to Datadog", async() => {

   const aws = awsMock({"/aws/lambda/serverless-plugin-test-dev-hello": [{ filterName: "serverless-plugin-test-dev-HelloLogGroupSubscription" }] });
   const logGroupName: string = "/aws/lambda/serverless-plugin-test-dev-hello";
   const expectedSubName: string = "serverless-plugin-test-dev-HelloLogGroupSubscription";

   const canSubscribe = await canSubscribeLogGroup(aws,logGroupName,expectedSubName);
   expect(canSubscribe).toBeTruthy();

  });
  it("tells addCloudWatchForwarderSubscriptions function it can subscribe to a given log group with 1 existing subscription that does not belong to Datadog", async() => {

   const aws = awsMock({"/aws/lambda/serverless-plugin-test-dev-hello": [{ filterName: "unknown-filter-name" }] });
   const logGroupName: string = "/aws/lambda/serverless-plugin-test-dev-hello";
   const expectedSubName: string = "serverless-plugin-test-dev-HelloLogGroupSubscription";

   const canSubscribe = await canSubscribeLogGroup(aws,logGroupName,expectedSubName);
   expect(canSubscribe).toBeTruthy();

  });
  it("tells addCloudWatchForwarderSubscriptions function it can subscribe to a given log group with 2 existing subscriptions, 1 of which belongs to Datadog", async() => {

   const aws = awsMock({"/aws/lambda/serverless-plugin-test-dev-hello": [{ filterName: "serverless-plugin-test-dev-HelloLogGroupSubscription"}, { filterName: "unknown-filter-name"}  ] });
   const logGroupName: string = "/aws/lambda/serverless-plugin-test-dev-hello";
   const expectedSubName: string = "serverless-plugin-test-dev-HelloLogGroupSubscription";

   const canSubscribe = await canSubscribeLogGroup(aws,logGroupName,expectedSubName);
   expect(canSubscribe).toBeTruthy();

  });
  it("tells addCloudWatchForwarderSubscriptions function it cannot subscribe to a given log group with 2 existing subscriptions, both of which do not belong to Datadog", async() => {

   const aws = awsMock({"/aws/lambda/serverless-plugin-test-dev-hello": [{ filterName: "unknown-filter-name1" }, {filterName: "unknown-filter-name2"}] });
   const logGroupName: string = "/aws/lambda/serverless-plugin-test-dev-hello";
   const expectedSubName: string = "serverless-plugin-test-dev-HelloLogGroupSubscription";

   const canSubscribe = await canSubscribeLogGroup(aws,logGroupName,expectedSubName);
   expect(canSubscribe).toBeFalsy();

  });
});

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
  it("doesn't add subscription when two unknown subscriptions already exist", async () => {
    const service = serviceWithResources({
      FirstGroup: {
        Type: "AWS::Logs::LogGroup",
        Properties: {
          LogGroupName: "/aws/lambda/first-group",
        },
      },
    });

    const aws = awsMock({ "/aws/lambda/first-group": [{ filterName: "unknown-filter-name1" }, { filterName: "unknown-filter-name2"}] });

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
  it("adds a subscription when an known subscription already exists and the stack name is defined", async () => {
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

    const aws = awsMock(
      { "/aws/lambda/first-group": [{ filterName: "myCustomStackName-FirstGroupSubscription-XXXX" }] },
      "myCustomStackName",
    );

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
