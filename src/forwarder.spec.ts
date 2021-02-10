import Service from "serverless/classes/Service";
import { addCloudWatchForwarderSubscriptions, CloudFormationObjectArn, canSubscribeLogGroup } from "./forwarder";
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

function awsMock(existingSubs: { [key: string]: any }, stackName?: string, doesAlwaysReject?: boolean): Aws {
  return {
    getStage: () => "dev",
    request: (service, method, params: any) => {
      if (doesAlwaysReject) {
        return Promise.reject("Not found.");
      }
      const logGroupName = params.logGroupName;
      if (method == "getFunction") {
        return Promise.resolve();
      }
      if (method == "describeSubscriptionFilters") {
        if (existingSubs[logGroupName]) {
          return Promise.resolve({ subscriptionFilters: existingSubs[logGroupName] });
        }
      }
      return Promise.reject("Log group doesn't exist");
    },
    naming: {
      getStackName: () => stackName,
    } as { [key: string]: () => string },
  } as Aws;
}

describe("canSubscribeLogGroup", () => {
  it("Returns true if log group has 0 existing subscription filters.", async () => {
    const aws = awsMock({});
    const logGroupName: string = "/aws/lambda/serverless-plugin-test-dev-hello";
    const expectedSubName: string = "serverless-plugin-test-dev-HelloLogGroupSubscription";

    const canSubscribe = await canSubscribeLogGroup(aws, logGroupName, expectedSubName);
    expect(canSubscribe).toBe(true);
  });
  it("Returns true if log group has 1 existing Datadog subscription filter.", async () => {
    const aws = awsMock({
      "/aws/lambda/serverless-plugin-test-dev-hello": [
        { filterName: "serverless-plugin-test-dev-HelloLogGroupSubscription" },
      ],
    });
    const logGroupName: string = "/aws/lambda/serverless-plugin-test-dev-hello";
    const expectedSubName: string = "serverless-plugin-test-dev-HelloLogGroupSubscription";

    const canSubscribe = await canSubscribeLogGroup(aws, logGroupName, expectedSubName);
    expect(canSubscribe).toBe(true);
  });
  it("Returns true if log group has 1 existing non-Datadog subscription filter.", async () => {
    const aws = awsMock({ "/aws/lambda/serverless-plugin-test-dev-hello": [{ filterName: "unknown-filter-name" }] });
    const logGroupName: string = "/aws/lambda/serverless-plugin-test-dev-hello";
    const expectedSubName: string = "serverless-plugin-test-dev-HelloLogGroupSubscription";

    const canSubscribe = await canSubscribeLogGroup(aws, logGroupName, expectedSubName);
    expect(canSubscribe).toBe(true);
  });
  it("Returns true if log group has 2 existing subscription filters, 1 Datadog subscription filter, and 1 non-Datadog subscription filter.", async () => {
    const aws = awsMock({
      "/aws/lambda/serverless-plugin-test-dev-hello": [
        { filterName: "serverless-plugin-test-dev-HelloLogGroupSubscription" },
        { filterName: "unknown-filter-name" },
      ],
    });
    const logGroupName: string = "/aws/lambda/serverless-plugin-test-dev-hello";
    const expectedSubName: string = "serverless-plugin-test-dev-HelloLogGroupSubscription";

    const canSubscribe = await canSubscribeLogGroup(aws, logGroupName, expectedSubName);
    expect(canSubscribe).toBe(true);
  });
  it("Returns false if log group has 2 existing non-Datadog subscription filters.", async () => {
    const aws = awsMock({
      "/aws/lambda/serverless-plugin-test-dev-hello": [
        { filterName: "unknown-filter-name1" },
        { filterName: "unknown-filter-name2" },
      ],
    });
    const logGroupName: string = "/aws/lambda/serverless-plugin-test-dev-hello";
    const expectedSubName: string = "serverless-plugin-test-dev-HelloLogGroupSubscription";

    const canSubscribe = await canSubscribeLogGroup(aws, logGroupName, expectedSubName);
    expect(canSubscribe).toBe(false);
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
  it("doesn't add subscription when two non-Datadog subscriptions already exist", async () => {
    const service = serviceWithResources({
      FirstGroup: {
        Type: "AWS::Logs::LogGroup",
        Properties: {
          LogGroupName: "/aws/lambda/first-group",
        },
      },
    });

    const aws = awsMock({
      "/aws/lambda/first-group": [{ filterName: "unknown-filter-name1" }, { filterName: "unknown-filter-name2" }],
    });

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
  it("throws DatadogForwarderNotFoundError when forwarder ARN is not found", async () => {
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

    const aws = awsMock(
      {
        "/aws/lambda/serverless-plugin-test-dev-hello": [
          { filterName: "serverless-plugin-test-dev-HelloLogGroupSubscription" },
        ],
      },
      "myCustomStackName",
      true,
    );

    expect(async () => await addCloudWatchForwarderSubscriptions(service, aws, "my-func")).rejects.toThrow(
      "Could not perform GetFunction on my-func.",
    );
  });
  it("skips doesFowarderExist when functionArn is defined with CloudFormation subsitute variables", async () => {
    const service = serviceWithResources({});
    const aws = awsMock(
      {
        "/aws/lambda/serverless-plugin-test-dev-hello": [
          { filterName: "serverless-plugin-test-dev-HelloLogGroupSubscription" },
        ],
      },
      "myCustomStackName",
      true,
    );
    const functionArn: CloudFormationObjectArn = {
      "Fn::Sub": "!Sub arn:aws:lambda:${AWS::Region}:${AWS::AccountId}:function:datadog-logs-forwarder",
    };
    expect(async () => await addCloudWatchForwarderSubscriptions(service, aws, functionArn)).rejects.not.toThrow();
  });
});
