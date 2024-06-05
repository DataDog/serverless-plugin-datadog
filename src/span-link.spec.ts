// tslint:disable-next-line:no-var-requires
const stepFunctionsHelper = require("./step-functions-helper");
stepFunctionsHelper.updateDefinitionString = jest.fn().mockImplementation();

import Service from "serverless/classes/Service";
import Serverless from "serverless";
import { mergeStepFunctionAndLambdaTraces } from "./span-link";

describe("mergeStepFunctionAndLambdaTraces option related tests", () => {
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
  describe("test mergeStepFunctionAndLambdaTraces", () => {
    it("have no state machine in the resources", async () => {
      const resources = {
        "a-lambda-resource": {
          Type: "AWS::Lambda::Function",
        },
      };
      const service = serviceWithResources();
      const serverless: Serverless = service.serverless;
      mergeStepFunctionAndLambdaTraces(resources, serverless);
      expect(stepFunctionsHelper.updateDefinitionString).toBeCalledTimes(0);
    });

    it("have one state machine in the resources", async () => {
      const resources = {
        "unit-test-state-machine": {
          Type: "AWS::StepFunctions::StateMachine",
          Properties: {
            DefinitionString: {
              "Fn::Sub": ["real-definition-string", {}],
            },
          },
        },
        "another-resource": {
          Type: "AWS::Lambda::Function",
        },
      };
      const service = serviceWithResources();
      const serverless: Serverless = service.serverless;
      mergeStepFunctionAndLambdaTraces(resources, serverless);
      expect(stepFunctionsHelper.updateDefinitionString).toBeCalledTimes(1);
    });

    it("can handle a steate machine with a string DefinitionString", async () => {
      const resources = {
        "unit-test-state-machine": {
          Type: "AWS::StepFunctions::StateMachine",
          Properties: {
            DefinitionString:
              '{"Comment":"Some comment","StartAt":"agocsTest1","States":{"agocsTest1":{"Type":"Task","Resource":"arn:aws:states:::states:startExecution.sync:2","Parameters":{"StateMachineArn":"arn:aws:states:::states:startExecution.sync:2","Input":{"foo":"bar"}},"End":true}}}',
          },
        },
        "another-resource": {
          Type: "AWS::Lambda::Function",
        },
      };
      const service = serviceWithResources();
      const serverless: Serverless = service.serverless;
      mergeStepFunctionAndLambdaTraces(resources, serverless);
      expect(stepFunctionsHelper.updateDefinitionString).toBeCalledTimes(1);
    });

    it("have two state machine in the resources", async () => {
      const resources = {
        "unit-test-state-machine": {
          Type: "AWS::StepFunctions::StateMachine",
          Properties: {
            DefinitionString: {
              "Fn::Sub": ["real-definition-string", {}],
            },
          },
        },
        "unit-test-state-machine2": {
          Type: "AWS::StepFunctions::StateMachine",
          Properties: {
            DefinitionString: {
              "Fn::Sub": ["real-definition-string", {}],
            },
          },
        },
        "another-resource": {
          Type: "AWS::Lambda::Function",
        },
      };
      const service = serviceWithResources();
      const serverless: Serverless = service.serverless;
      mergeStepFunctionAndLambdaTraces(resources, serverless);
      expect(stepFunctionsHelper.updateDefinitionString).toBeCalledTimes(2);
    });
  });
});
