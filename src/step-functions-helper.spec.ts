// const forwarderSpec = require ('./forwarder.spec')
// forwarderSpec.serviceWithResources = jest.fn().mockImplementation(() => {
//   return {
//     serverless: {
//       cli: {
//         log: () => "",
//       },
//     },
//   }
// })

import { updateDefinitionString } from "./step-functions-helper";
// import {serviceWithResources} from "./forwarder.spec";
import Service from "serverless/classes/Service";
import { StateMachineDefinition } from "./forwarder";

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
});
