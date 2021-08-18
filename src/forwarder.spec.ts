import Service from "serverless/classes/Service";
import { addCloudWatchForwarderSubscriptions, CloudFormationObjectArn, canSubscribeLogGroup } from "./forwarder";
import Aws from "serverless/plugins/aws/provider/awsProvider";
import { resolveConfigFile } from "prettier";
import { FunctionInfo, RuntimeType } from "./layer";

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
      FirstLogGroup: {
        Type: "AWS::Logs::LogGroup",
        Properties: {
          LogGroupName: "/aws/lambda/first",
        },
      },
      SecondLogGroup: {
        Type: "AWS::Logs::LogGroup",
        Properties: {
          LogGroupName: "/aws/lambda/second",
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

    const handlers: FunctionInfo[] = [
      {
        handler: {
          environment: {},
          events: [],
        },
        name: "first",
        type: RuntimeType.NODE,
      },
      {
        handler: {
          environment: {},
          events: [],
        },
        name: "second",
        type: RuntimeType.NODE,
      },
    ];

    await addCloudWatchForwarderSubscriptions(service as Service, aws, "my-func", forwarderConfigs, handlers);
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
        "FirstLogGroup": Object {
          "Properties": Object {
            "LogGroupName": "/aws/lambda/first",
          },
          "Type": "AWS::Logs::LogGroup",
        },
        "FirstLogGroupSubscription": Object {
          "Properties": Object {
            "DestinationArn": "my-func",
            "FilterPattern": "",
            "LogGroupName": Object {
              "Ref": "FirstLogGroup",
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
        "SecondLogGroup": Object {
          "Properties": Object {
            "LogGroupName": "/aws/lambda/second",
          },
          "Type": "AWS::Logs::LogGroup",
        },
        "SecondLogGroupSubscription": Object {
          "Properties": Object {
            "DestinationArn": "my-func",
            "FilterPattern": "",
            "LogGroupName": Object {
              "Ref": "SecondLogGroup",
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

  it("does not add subscriptions for log groups that have their subscriptions disabled", async () => {
    const service = serviceWithResources({
      FirstLogGroup: {
        Type: "AWS::Logs::LogGroup",
        Properties: {
          LogGroupName: "/aws/lambda/first",
        },
      },
      SecondLogGroup: {
        Type: "AWS::Logs::LogGroup",
        Properties: {
          LogGroupName: "/aws/lambda/second",
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

    const handlers: FunctionInfo[] = [
      {
        handler: {
          environment: {},
          events: [],
        },
        name: "first",
        type: RuntimeType.NODE,
      },
      {
        handler: {
          environment: {},
          events: [],
        },
        name: "second",
        type: RuntimeType.NODE,
      },
    ];

    await addCloudWatchForwarderSubscriptions(service as Service, aws, "my-func", forwarderConfigs, handlers);
    expect(service.provider.compiledCloudFormationTemplate.Resources).toMatchInlineSnapshot(`
      Object {
        "ApiGatewayGroup": Object {
          "Properties": Object {
            "LogGroupName": "/aws/api-gateway/gateway-group",
          },
          "Type": "AWS::Logs::LogGroup",
        },
        "FirstLogGroup": Object {
          "Properties": Object {
            "LogGroupName": "/aws/lambda/first",
          },
          "Type": "AWS::Logs::LogGroup",
        },
        "FirstLogGroupSubscription": Object {
          "Properties": Object {
            "DestinationArn": "my-func",
            "FilterPattern": "",
            "LogGroupName": Object {
              "Ref": "FirstLogGroup",
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
        "SecondLogGroup": Object {
          "Properties": Object {
            "LogGroupName": "/aws/lambda/second",
          },
          "Type": "AWS::Logs::LogGroup",
        },
        "SecondLogGroupSubscription": Object {
          "Properties": Object {
            "DestinationArn": "my-func",
            "FilterPattern": "",
            "LogGroupName": Object {
              "Ref": "SecondLogGroup",
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
      FirstLogGroup: {
        Type: "AWS::Logs::LogGroup",
        Properties: {
          LogGroupName: "/aws/lambda/first",
        },
      },
    });

    const aws = awsMock({
      "/aws/lambda/first": [{ filterName: "unknown-filter-name1" }, { filterName: "unknown-filter-name2" }],
    });

    const forwarderConfigs = {
      AddExtension: false,
      IntegrationTesting: false,
      SubToApiGatewayLogGroup: true,
      SubToHttpApiLogGroup: true,
      SubToWebsocketLogGroup: true,
    };

    const handlers: FunctionInfo[] = [
      {
        handler: {
          environment: {},
          events: [],
        },
        name: "first",
        type: RuntimeType.NODE,
      },
    ];

    await addCloudWatchForwarderSubscriptions(service as Service, aws, "my-func", forwarderConfigs, handlers);
    expect(service.provider.compiledCloudFormationTemplate.Resources).toMatchInlineSnapshot(`
      Object {
        "FirstLogGroup": Object {
          "Properties": Object {
            "LogGroupName": "/aws/lambda/first",
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

    const handlers: FunctionInfo[] = [
      {
        handler: {
          environment: {},
          events: [],
        },
        name: "First",
        type: RuntimeType.NODE,
      },
    ];

    const errors = await addCloudWatchForwarderSubscriptions(
      service as Service,
      aws,
      "my-func",
      forwarderConfigs,
      handlers,
    );
    expect(errors).toMatchInlineSnapshot(`
      Array [
        "No cloudformation stack available. Skipping subscribing Datadog forwarder.",
      ]
    `);
  });

  it("adds a subscription when an known subscription already exists", async () => {
    const service = serviceWithResources(
      {
        FirstLogGroup: {
          Type: "AWS::Logs::LogGroup",
          Properties: {
            LogGroupName: "/aws/lambda/first",
          },
        },
      },
      "my-service",
    );

    const aws = awsMock({
      "/aws/lambda/first": [{ filterName: "my-service-dev-FirstLogGroupSubscription-XXXX" }],
    });

    const forwarderConfigs = {
      AddExtension: false,
      IntegrationTesting: false,
      SubToApiGatewayLogGroup: true,
      SubToHttpApiLogGroup: true,
      SubToWebsocketLogGroup: true,
    };

    const handlers: FunctionInfo[] = [
      {
        handler: {
          environment: {},
          events: [],
        },
        name: "first",
        type: RuntimeType.NODE,
      },
    ];

    await addCloudWatchForwarderSubscriptions(service as Service, aws, "my-func", forwarderConfigs, handlers);
    expect(service.provider.compiledCloudFormationTemplate.Resources).toMatchInlineSnapshot(`
      Object {
        "FirstLogGroup": Object {
          "Properties": Object {
            "LogGroupName": "/aws/lambda/first",
          },
          "Type": "AWS::Logs::LogGroup",
        },
        "FirstLogGroupSubscription": Object {
          "Properties": Object {
            "DestinationArn": "my-func",
            "FilterPattern": "",
            "LogGroupName": Object {
              "Ref": "FirstLogGroup",
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
        FirstLogGroup: {
          Type: "AWS::Logs::LogGroup",
          Properties: {
            LogGroupName: "/aws/lambda/first",
          },
        },
      },
      "my-service",
    );

    const aws = awsMock(
      { "/aws/lambda/first": [{ filterName: "myCustomStackName-FirstLogGroupSubscription-XXXX" }] },
      "myCustomStackName",
    );

    const forwarderConfigs = {
      AddExtension: false,
      IntegrationTesting: false,
      SubToApiGatewayLogGroup: true,
      SubToHttpApiLogGroup: true,
      SubToWebsocketLogGroup: true,
    };

    const handlers: FunctionInfo[] = [
      {
        handler: {
          environment: {},
          events: [],
        },
        name: "first",
        type: RuntimeType.NODE,
      },
    ];

    await addCloudWatchForwarderSubscriptions(service as Service, aws, "my-func", forwarderConfigs, handlers);
    expect(service.provider.compiledCloudFormationTemplate.Resources).toMatchInlineSnapshot(`
      Object {
        "FirstLogGroup": Object {
          "Properties": Object {
            "LogGroupName": "/aws/lambda/first",
          },
          "Type": "AWS::Logs::LogGroup",
        },
        "FirstLogGroupSubscription": Object {
          "Properties": Object {
            "DestinationArn": "my-func",
            "FilterPattern": "",
            "LogGroupName": Object {
              "Ref": "FirstLogGroup",
            },
          },
          "Type": "AWS::Logs::SubscriptionFilter",
        },
      }
    `);
  });

  it("throws DatadogForwarderNotFoundError when function ARN is not found", async () => {
    const service = serviceWithResources({
      FirstLogGroup: {
        Type: "AWS::Logs::LogGroup",
        Properties: {
          LogGroupName: "/aws/lambda/first",
        },
      },
      SecondLogGroup: {
        Type: "AWS::Logs::LogGroup",
        Properties: {
          LogGroupName: "/aws/lambda/second",
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

    const handlers: FunctionInfo[] = [
      {
        handler: {
          environment: {},
          events: [],
        },
        name: "first",
        type: RuntimeType.NODE,
      },
      {
        handler: {
          environment: {},
          events: [],
        },
        name: "second",
        type: RuntimeType.NODE,
      },
    ];

    expect(
      async () => await addCloudWatchForwarderSubscriptions(service, aws, "my-func", forwarderConfigs, handlers),
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

    const handlers: FunctionInfo[] = [
      {
        handler: {
          environment: {},
          events: [],
        },
        name: "first",
        type: RuntimeType.NODE,
      },
    ];

    const errors: string[] = await addCloudWatchForwarderSubscriptions(
      service,
      aws,
      functionArn,
      forwarderConfigs,
      handlers,
    );
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
    const handlers: FunctionInfo[] = [
      {
        handler: {
          environment: {},
          events: [],
        },
        name: "first",
        type: RuntimeType.NODE,
      },
    ];

    const errors: string[] = await addCloudWatchForwarderSubscriptions(
      service,
      aws,
      functionArn,
      forwarderConfigs,
      handlers,
    );
    expect(errors.includes("Skipping forwarder ARN validation because 'integrationTesting' is set to true")).toBe(true);
  });

  it("skips creating a forwarder for the SecondLogGroup when the function Second is not in the list of handlers", async () => {
    const service = serviceWithResources({
      FirstLogGroup: {
        Type: "AWS::Logs::LogGroup",
        Properties: {
          LogGroupName: "/aws/lambda/first",
        },
      },
      SecondLogGroup: {
        Type: "AWS::Logs::LogGroup",
        Properties: {
          LogGroupName: "/aws/lambda/second",
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

    const handlers: FunctionInfo[] = [
      {
        handler: {
          environment: {},
          events: [],
        },
        name: "first",
        type: RuntimeType.NODE,
      },
    ];

    await addCloudWatchForwarderSubscriptions(service as Service, aws, "my-func", forwarderConfigs, handlers);
    expect(service.provider.compiledCloudFormationTemplate.Resources).toMatchInlineSnapshot(`
      Object {
        "FirstLogGroup": Object {
          "Properties": Object {
            "LogGroupName": "/aws/lambda/first",
          },
          "Type": "AWS::Logs::LogGroup",
        },
        "FirstLogGroupSubscription": Object {
          "Properties": Object {
            "DestinationArn": "my-func",
            "FilterPattern": "",
            "LogGroupName": Object {
              "Ref": "FirstLogGroup",
            },
          },
          "Type": "AWS::Logs::SubscriptionFilter",
        },
        "SecondLogGroup": Object {
          "Properties": Object {
            "LogGroupName": "/aws/lambda/second",
          },
          "Type": "AWS::Logs::LogGroup",
        },
      }
    `);
  });

  it("can map a function name with a dash in it's name", async () => {
    const service = serviceWithResources({
      FirstDashtestLogGroup: {
        Type: "AWS::Logs::LogGroup",
        Properties: {
          LogGroupName: "/aws/lambda/first",
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

    const handlers: FunctionInfo[] = [
      {
        handler: {
          environment: {},
          events: [],
        },
        name: "first-test",
        type: RuntimeType.NODE,
      },
    ];

    await addCloudWatchForwarderSubscriptions(service as Service, aws, "my-func", forwarderConfigs, handlers);
    expect(service.provider.compiledCloudFormationTemplate.Resources).toMatchInlineSnapshot(`
      Object {
        "FirstDashtestLogGroup": Object {
          "Properties": Object {
            "LogGroupName": "/aws/lambda/first",
          },
          "Type": "AWS::Logs::LogGroup",
        },
        "FirstDashtestLogGroupSubscription": Object {
          "Properties": Object {
            "DestinationArn": "my-func",
            "FilterPattern": "",
            "LogGroupName": Object {
              "Ref": "FirstDashtestLogGroup",
            },
          },
          "Type": "AWS::Logs::SubscriptionFilter",
        },
      }
    `);
  });
});
