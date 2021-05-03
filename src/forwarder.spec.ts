import Service from "serverless/classes/Service";
import { addCloudWatchForwarderSubscriptions, CloudFormationObjectArn, canSubscribeLogGroup } from "./forwarder";
import Aws from "serverless/plugins/aws/provider/awsProvider";
import { resolveConfigFile } from "prettier";

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
      ApiGatewayGroup: {
        Type: "AWS::Logs::LogGroup",
        Properties: {
          LogGroupName: "/aws/api-gateway/gateway-group",
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
      HttpApiGroup: {
        Type: "AWS::Logs::LogGroup",
        Properties: {
          LogGroupName: "/aws/http-api/http-group",
        },
      },
      WebsocketGroup: {
        Type: "AWS::Logs::LogGroup",
        Properties: {
          LogGroupName: "/aws/websocket/websocket-group",
        },
      },
    });

    const aws = awsMock({});

    const forwarderConfigs = {
      AddExtension: false,
      IntegrationTesting: false,
      SubToApiGatewayLogGroup: true,
      SubToHttpApiLogGroup: true,
      SubToWebsocketLogGroup: true,
    };

    await addCloudWatchForwarderSubscriptions(service as Service, aws, "my-func", forwarderConfigs);
    expect(service.provider.compiledCloudFormationTemplate.Resources).toMatchInlineSnapshot(`
      Object {
        "ApiGatewayGroup": Object {
          "Properties": Object {
            "LogGroupName": "/aws/api-gateway/gateway-group",
          },
          "Type": "AWS::Logs::LogGroup",
        },
        "ApiGatewayGroupSubscription": Object {
          "Properties": Object {
            "DestinationArn": "my-func",
            "FilterPattern": "",
            "LogGroupName": Object {
              "Ref": "ApiGatewayGroup",
            },
          },
          "Type": "AWS::Logs::SubscriptionFilter",
        },
        "ExecutionLogGroup": Object {
          "Properties": Object {
            "LogGroupName": Object {
              "Fn::Join": Array [
                "",
                Array [
                  "API-Gateway-Execution-Logs_",
                  Object {
                    "Ref": "ApiGatewayRestApi",
                  },
                  "/",
                  "dev",
                ],
              ],
            },
          },
          "Type": "AWS::Logs::LogGroup",
        },
        "ExecutionLogGroupSubscription": Object {
          "Properties": Object {
            "DestinationArn": "my-func",
            "FilterPattern": "",
            "LogGroupName": Object {
              "Ref": "ExecutionLogGroup",
            },
          },
          "Type": "AWS::Logs::SubscriptionFilter",
        },
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
        "HttpApiGroup": Object {
          "Properties": Object {
            "LogGroupName": "/aws/http-api/http-group",
          },
          "Type": "AWS::Logs::LogGroup",
        },
        "HttpApiGroupSubscription": Object {
          "Properties": Object {
            "DestinationArn": "my-func",
            "FilterPattern": "",
            "LogGroupName": Object {
              "Ref": "HttpApiGroup",
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
        "WebsocketGroup": Object {
          "Properties": Object {
            "LogGroupName": "/aws/websocket/websocket-group",
          },
          "Type": "AWS::Logs::LogGroup",
        },
        "WebsocketGroupSubscription": Object {
          "Properties": Object {
            "DestinationArn": "my-func",
            "FilterPattern": "",
            "LogGroupName": Object {
              "Ref": "WebsocketGroup",
            },
          },
          "Type": "AWS::Logs::SubscriptionFilter",
        },
      }
    `);
  });

  it("it does not add subscriptions for log groups that have their subscriptions diabled", async () => {
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
      ApiGatewayGroup: {
        Type: "AWS::Logs::LogGroup",
        Properties: {
          LogGroupName: "/aws/api-gateway/gateway-group",
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
      HttpApiGroup: {
        Type: "AWS::Logs::LogGroup",
        Properties: {
          LogGroupName: "/aws/http-api/http-group",
        },
      },
      WebsocketGroup: {
        Type: "AWS::Logs::LogGroup",
        Properties: {
          LogGroupName: "/aws/websocket/websocket-group",
        },
      },
    });

    const aws = awsMock({});

    const forwarderConfigs = {
      AddExtension: false,
      IntegrationTesting: false,
      SubToApiGatewayLogGroup: false,
      SubToHttpApiLogGroup: false,
      SubToWebsocketLogGroup: true,
    };

    await addCloudWatchForwarderSubscriptions(service as Service, aws, "my-func", forwarderConfigs);
    expect(service.provider.compiledCloudFormationTemplate.Resources).toMatchInlineSnapshot(`
      Object {
        "ApiGatewayGroup": Object {
          "Properties": Object {
            "LogGroupName": "/aws/api-gateway/gateway-group",
          },
          "Type": "AWS::Logs::LogGroup",
        },
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
        "HttpApiGroup": Object {
          "Properties": Object {
            "LogGroupName": "/aws/http-api/http-group",
          },
          "Type": "AWS::Logs::LogGroup",
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
        "WebsocketGroup": Object {
          "Properties": Object {
            "LogGroupName": "/aws/websocket/websocket-group",
          },
          "Type": "AWS::Logs::LogGroup",
        },
        "WebsocketGroupSubscription": Object {
          "Properties": Object {
            "DestinationArn": "my-func",
            "FilterPattern": "",
            "LogGroupName": Object {
              "Ref": "WebsocketGroup",
            },
          },
          "Type": "AWS::Logs::SubscriptionFilter",
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

    const forwarderConfigs = {
      AddExtension: false,
      IntegrationTesting: false,
      SubToApiGatewayLogGroup: true,
      SubToHttpApiLogGroup: true,
      SubToWebsocketLogGroup: true,
    };

    await addCloudWatchForwarderSubscriptions(service as Service, aws, "my-func", forwarderConfigs);
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

    const forwarderConfigs = {
      AddExtension: false,
      IntegrationTesting: false,
      SubToApiGatewayLogGroup: true,
      SubToHttpApiLogGroup: true,
      SubToWebsocketLogGroup: true,
    };

    const errors = await addCloudWatchForwarderSubscriptions(service as Service, aws, "my-func", forwarderConfigs);
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

    const forwarderConfigs = {
      AddExtension: false,
      IntegrationTesting: false,
      SubToApiGatewayLogGroup: true,
      SubToHttpApiLogGroup: true,
      SubToWebsocketLogGroup: true,
    };

    await addCloudWatchForwarderSubscriptions(service as Service, aws, "my-func", forwarderConfigs);
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

    const forwarderConfigs = {
      AddExtension: false,
      IntegrationTesting: false,
      SubToApiGatewayLogGroup: true,
      SubToHttpApiLogGroup: true,
      SubToWebsocketLogGroup: true,
    };

    await addCloudWatchForwarderSubscriptions(service as Service, aws, "my-func", forwarderConfigs);
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

  it("throws DatadogForwarderNotFoundError when function ARN is not found", async () => {
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

    const forwarderConfigs = {
      AddExtension: false,
      IntegrationTesting: false,
      SubToApiGatewayLogGroup: true,
      SubToHttpApiLogGroup: true,
      SubToWebsocketLogGroup: true,
    };

    expect(
      async () => await addCloudWatchForwarderSubscriptions(service, aws, "my-func", forwarderConfigs),
    ).rejects.toThrow("Could not perform GetFunction on my-func.");
  });

  it("skips doesFowarderExist when functionArn is defined with CloudFormation substitute variables", async () => {
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

    const forwarderConfigs = {
      AddExtension: false,
      IntegrationTesting: false,
      SubToApiGatewayLogGroup: true,
      SubToHttpApiLogGroup: true,
      SubToWebsocketLogGroup: true,
    };

    const errors: string[] = await addCloudWatchForwarderSubscriptions(service, aws, functionArn, forwarderConfigs);
    expect(
      errors.includes(
        "Skipping forwarder ARN validation because forwarder string defined with CloudFormation function.",
      ),
    ).toBe(true);
  });

  it("skips validating the forwarder when `integrationTesting` is true", async () => {
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
    const functionArn: string = "forwarderArn";
    const forwarderConfigs = {
      AddExtension: false,
      IntegrationTesting: true,
      SubToApiGatewayLogGroup: true,
      SubToHttpApiLogGroup: true,
      SubToWebsocketLogGroup: true,
    };
    const errors: string[] = await addCloudWatchForwarderSubscriptions(service, aws, functionArn, forwarderConfigs);
    expect(errors.includes("Skipping forwarder ARN validation because 'integrationTesting' is set to true")).toBe(true);
  });
});
