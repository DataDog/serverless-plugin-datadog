import {
  isDefaultLambdaApiStep,
  isSafeToModifyStepFunctionInvoctation,
  isSafeToModifyStepFunctionLambdaInvocation,
  StateMachineDefinition,
  updateDefinitionString,
} from "./step-functions-helper";

import Service from "serverless/classes/Service";

function serviceWithResources(resources?: Record<string, any>, serviceName = "my-service"): Service {
  const service = {
    getServiceName: () => serviceName,
    serverless: {
      cli: {
        log: () => "",
      },
    },
    provider: {
      name: "",
      stage: "",
      region: "",
      versionFunctions: true,
      compiledCloudFormationTemplate: {
        Resources: resources as any,
        Outputs: {},
      },
      logs: {
        restApi: true,
        httpApi: true,
        websocket: true,
      },
    },
  };
  return service as any;
}

describe("test updateDefinitionString", () => {
  const serverless = serviceWithResources().serverless;
  it("test lambda step with default payload of '$'", async () => {
    const definitionString = {
      "Fn::Sub": [
        '{"Comment":"fake comment","StartAt":"InvokeLambda","States":{"InvokeLambda":{"Type":"Task","Parameters":{"FunctionName":"fake-function-name","Payload.$":"$"},"Resource":"arn:aws:states:::lambda:invoke","End":true}}}',
        {},
      ],
    };
    const stateMachineName = "fake-state-machine-name";
    updateDefinitionString(definitionString, serverless, stateMachineName);

    const definitionAfterUpdate: StateMachineDefinition = JSON.parse(definitionString["Fn::Sub"][0] as string);
    expect(definitionAfterUpdate.States?.InvokeLambda?.Parameters?.["Payload.$"]).toBe(
      "States.JsonMerge($$, $, false)",
    );
  });

  it("test lambda step without Payload", async () => {
    const definitionString = {
      "Fn::Sub": [
        '{"Comment":"fake comment","StartAt":"InvokeLambda","States":{"InvokeLambda":{"Type":"Task","Parameters":{"FunctionName":"fake-function-name"},"Resource":"arn:aws:states:::lambda:invoke","End":true}}}',
        {},
      ],
    };
    const stateMachineName = "fake-state-machine-name";
    updateDefinitionString(definitionString, serverless, stateMachineName);

    const definitionAfterUpdate: StateMachineDefinition = JSON.parse(definitionString["Fn::Sub"][0] as string);
    expect(definitionAfterUpdate.States?.InvokeLambda?.Parameters?.["Payload.$"]).toBe(
      "States.JsonMerge($$, $, false)",
    );
  });

  it("test lambda step already has customized payload set do nothing", async () => {
    const definitionString = {
      "Fn::Sub": [
        '{"Comment":"fake comment","StartAt":"InvokeLambda","States":{"InvokeLambda":{"Type":"Task","Parameters":{"FunctionName":"fake-function-name","Payload.$":"something-customized"},"Resource":"arn:aws:states:::lambda:invoke","End":true}}}',
        {},
      ],
    };
    const stateMachineName = "fake-state-machine-name";
    updateDefinitionString(definitionString, serverless, stateMachineName);

    const definitionAfterUpdate: StateMachineDefinition = JSON.parse(definitionString["Fn::Sub"][0] as string);
    expect(definitionAfterUpdate.States?.InvokeLambda?.Parameters?.["Payload.$"]).toBe("something-customized");
  });

  it("test lambda basic legacy integration do nothing", async () => {
    const definitionString = {
      "Fn::Sub": [
        '{"Comment":"fake comment","StartAt":"InvokeLambda","States":{"InvokeLambda":{"Type":"Task","Resource":"arn:aws:lambda:sa-east-1:601427271234:function:unit-test-function-name","End":true}}}',
        {},
      ],
    };
    const stateMachineName = "fake-state-machine-name";
    updateDefinitionString(definitionString, serverless, stateMachineName);

    const definitionAfterUpdate: StateMachineDefinition = JSON.parse(definitionString["Fn::Sub"][0] as string);
    expect(definitionAfterUpdate.States?.InvokeLambda?.Parameters?.["Payload.$"]).toBe(undefined);
  });

  it("test non-lambda steps do nothing", async () => {
    const definitionString = {
      "Fn::Sub": [
        '{"Comment":"fake comment","StartAt":"InvokeLambda","States":{"InvokeDynamodb":{"Type":"Task","Parameters":{"someKey":"someValue"},"Resource":"arn:aws:states:::dynamodb:updateItem","End":true}}}',
        {},
      ],
    };
    const stateMachineName = "fake-state-machine-name";
    updateDefinitionString(definitionString, serverless, stateMachineName);

    const definitionAfterUpdate: StateMachineDefinition = JSON.parse(definitionString["Fn::Sub"][0] as string);
    expect(definitionAfterUpdate.States?.InvokeDynamodb).toStrictEqual({
      End: true,
      Parameters: { someKey: "someValue" },
      Resource: "arn:aws:states:::dynamodb:updateItem",
      Type: "Task",
    });
  });

  it("test legacy lambda api do nothing", async () => {
    const definitionString = {
      "Fn::Sub": [
        '{"Comment":"fake comment","StartAt":"InvokeLambda","States":{"InvokeLambda":{"Type":"Task","Parameters":{"FunctionName":"fake-function-name","Payload.$":"$"},"Resource":"arn:aws:lambda:sa-east-1:601427271234:function:unit-test-function-name","End":true}}}',
        {},
      ],
    };
    const stateMachineName = "fake-state-machine-name";
    updateDefinitionString(definitionString, serverless, stateMachineName);

    const definitionAfterUpdate: StateMachineDefinition = JSON.parse(definitionString["Fn::Sub"][0] as string);
    expect(definitionAfterUpdate.States?.InvokeLambda).toStrictEqual({
      End: true,
      Parameters: {
        FunctionName: "fake-function-name",
        "Payload.$": "$",
      },
      Resource: "arn:aws:lambda:sa-east-1:601427271234:function:unit-test-function-name",
      Type: "Task",
    });
  });

  it("test empty Fn::Sub", async () => {
    const definitionString = {
      "Fn::Sub": [],
    };
    const stateMachineName = "fake-state-machine-name";
    updateDefinitionString(definitionString, serverless, stateMachineName);

    expect(definitionString["Fn::Sub"].length).toBe(0);
  });

  it("test step function invocation", async () => {
    const definitionString = {
      "Fn::Sub": [
        '{"Comment": "A description of my state machine", "StartAt": "Step Functions StartExecution", "States": {"Step Functions StartExecution": {"Type": "Task", "Resource": "arn:aws:states:::states:startExecution", "Parameters": {"StateMachineArn": "arn:aws:states:us-east-1:425362996713:stateMachine:agocs-test-noop-state-machine-2", "Input": {"StatePayload": "Hello from Step Functions!", "AWS_STEP_FUNCTIONS_STARTED_BY_EXECUTION_ID.$": "$$.Execution.Id" }}, "End": true }}}',
        {},
      ],
    };
    const stateMachineName = "fake-state-machine-name";
    updateDefinitionString(definitionString, serverless, stateMachineName);

    const definitionAfterUpdate: StateMachineDefinition = JSON.parse(definitionString["Fn::Sub"][0] as string);
    expect(definitionAfterUpdate.States["Step Functions StartExecution"]?.Parameters?.Input?.["CONTEXT.$"]).toBe(
      "States.JsonMerge($$, $, false)",
    );
  });

  // it("test step function invocation without input", async () => {
  //   const definitionString = {
  //     "Fn::Sub": [
  //       '{"Comment": "A description of my state machine", "StartAt": "Step Functions StartExecution", "States": {"Step Functions StartExecution": {"Type": "Task", "Resource": "arn:aws:states:::states:startExecution", "Parameters": {"StateMachineArn": "arn:aws:states:us-east-1:425362996713:stateMachine:agocs-test-noop-state-machine-2"}, "End": true }}}',
  //       {},
  //     ],
  //   };
  //   const stateMachineName = "fake-state-machine-name";
  //   updateDefinitionString(definitionString, serverless, stateMachineName);

  //   const definitionAfterUpdate: StateMachineDefinition = JSON.parse(definitionString["Fn::Sub"][0] as string);
  //   expect(definitionAfterUpdate.States?.InvokeLambda?.Parameters?.Input?.["CONTEXT.$"]).toBe(
  //     "States.JsonMerge($$, $, false)",
  //   );
  // });
});

describe("test isSafeToModifyStepFunctionLambdaInvocation", () => {
  it("Payload field not set in parameters", async () => {
    const parameters = { FunctionName: "bla" };
    expect(isSafeToModifyStepFunctionLambdaInvocation(parameters)).toBeTruthy();
  });

  it("Payload field empty", async () => {
    const parameters = { FunctionName: "bla", "Payload.$": {} };
    expect(isSafeToModifyStepFunctionLambdaInvocation(parameters)).toBeFalsy();
  });

  it("Payload field default to $", async () => {
    const parameters = { FunctionName: "bla", "Payload.$": "$" };
    expect(isSafeToModifyStepFunctionLambdaInvocation(parameters)).toBeTruthy();
  });

  it("Payload field default to $", async () => {
    const parameters = { FunctionName: "bla", "Payload.$": "something customer has already set and not empty" };
    expect(isSafeToModifyStepFunctionLambdaInvocation(parameters)).toBeFalsy();
  });
});

describe("test isSafeToModifyStepFunctionInvoctation", () => {
  it("Input field not set in parameters", async () => {
    const parameters = { StateMachineArn: "bla" };
    expect(isSafeToModifyStepFunctionInvoctation(parameters)).toBeTruthy();
  });

  it("Input field empty", async () => {
    const parameters = { FunctionName: "bla", Input: {} };
    expect(isSafeToModifyStepFunctionInvoctation(parameters)).toBeFalsy();
  });

  it("Input field is not an object", async () => {
    const parameters = { FunctionName: "bla", Input: "foo" };
    expect(isSafeToModifyStepFunctionInvoctation(parameters)).toBeFalsy();
  });

  it("Input field has stuff in it", async () => {
    const parameters = { FunctionName: "bla", Input: {"foo": "bar"} };
    expect(isSafeToModifyStepFunctionInvoctation(parameters)).toBeTruthy();
  });

  it("Input field has CONTEXT.$ already", async () => {
    const parameters = { FunctionName: "bla", Input: {"CONTEXT.$": "something else"} };
    expect(isSafeToModifyStepFunctionInvoctation(parameters)).toBeFalsy();
  });
});

describe("test isDefaultLambdaApiStep", () => {
  it("resource is default lambda", async () => {
    const resource = "arn:aws:states:::lambda:invoke";
    expect(isDefaultLambdaApiStep(resource)).toBeTruthy();
  });

  it("resource is lambda arn for legacy lambda api", async () => {
    const resource = "arn:aws:lambda:sa-east-1:601427271234:function:hello-function";
    expect(isDefaultLambdaApiStep(resource)).toBeFalsy();
  });

  it("resource of dynamodb", async () => {
    const resource = "arn:aws:states:::dynamodb:updateItem";
    expect(isDefaultLambdaApiStep(resource)).toBeFalsy();
  });

  it("resource of empty string", async () => {
    const resource = "";
    expect(isDefaultLambdaApiStep(resource)).toBeFalsy();
  });

  it("resource of undefined", async () => {
    const resource = undefined;
    expect(isDefaultLambdaApiStep(resource)).toBeFalsy();
  });
});
