import Serverless from "serverless";

export function isSafeToModifyStepFunctionLambdaInvocation(parameters: any): boolean {
  if (typeof parameters !== "object") {
    return false;
  }
  if (!parameters.hasOwnProperty("Payload.$")) {
    return true;
  } else {
    if (parameters["Payload.$"] === "$") {
      // $ % is the default original unchanged payload
      return true;
    }
  }

  return false;
}

// Truth table
// Input                    | Expected
// -------------------------|---------
// Empty object             | true
// undefined                | true
// not object               | false
// object without CONTEXT.$ | true
// object with CONTEXT.$    | false
export function isSafeToModifyStepFunctionInvoctation(parameters: any): boolean {
  if (typeof parameters !== "object") {
    return false;
  }

  if (!parameters.hasOwnProperty("Input")) {
    return true;
  }

  if (typeof parameters.Input !== "object") {
    return false;
  }

  if (!parameters.Input.hasOwnProperty("CONTEXT.$")) {
    return true;
  }
  return false;
}

export interface GeneralResource {
  Type: string;
  Properties?: {
    DefinitionString?:
      | string
      | {
          "Fn::Sub": any[];
        };
  };
}

export interface StateMachineDefinition {
  States: { [key: string]: StateMachineStep };
}

export interface StateMachineStep {
  Resource?: string;
  Parameters?: {
    FunctionName?: string;
    "Payload.$"?: string;
    Input?: {
      "CONTEXT.$"?: string;
    };
  };
  Next?: string;
  End?: boolean;
}

export function isDefaultLambdaApiStep(resource: string | undefined): boolean {
  // default means not legacy lambda api
  if (resource === undefined) {
    return false;
  }
  if (resource === "arn:aws:states:::lambda:invoke") {
    // Legacy Lambda API resource.startsWith("arn:aws:lambda"), but it cannot inject context obj.
    return true;
  }
  return false;
}

export function isStepFunctionInvocation(resource: string | undefined): boolean {
  if (resource === undefined) {
    return false;
  }
  if (resource.startsWith("arn:aws:states:::states:startExecution")) {
    return true;
  }
  return false;
}

function parseDefinitionObject(definitionString: { "Fn::Sub": (string | object)[] }): StateMachineDefinition {
  if (
    !(typeof definitionString === "object" && "Fn::Sub" in definitionString && definitionString["Fn::Sub"].length > 0)
  ) {
    throw new Error("unexpected definitionString");
  }
  const unparsedDefinition = definitionString["Fn::Sub"] ? definitionString["Fn::Sub"][0] : ""; // index 0 should always be a string of step functions definition
  if (unparsedDefinition === "") {
    throw new Error("no definition string found in DefinitionString");
  }
  const definitionObj: StateMachineDefinition = JSON.parse(unparsedDefinition as string);
  return definitionObj;
}

// Updates the definitionString of a step function to include trace context as appropriate for a Lambda invocation or a nested step function invocation.
// definitionString can either be an object or a naked string, so we need to return the same and explicitly modify the Resource in span-link.ts
export function updateDefinitionString(
  definitionString: string | { "Fn::Sub": (string | object)[] },
  serverless: Serverless,
  stateMachineName: string,
): string | { "Fn::Sub": (string | object)[] } {
  let definitionObj: StateMachineDefinition;

  if (typeof definitionString !== "string") {
    // definitionString is a {"Fn::Sub": (string | object)[]}
    try {
      definitionObj = parseDefinitionObject(definitionString);
    } catch (error) {
      serverless.cli.log("Unable to update StepFunction definition. " + error);
      return definitionString;
    }
  } else {
    definitionObj = JSON.parse(definitionString);
  }

  const states = definitionObj.States;
  for (const stepName in states) {
    if (states.hasOwnProperty(stepName)) {
      const step: StateMachineStep = states[stepName];
      if (!isDefaultLambdaApiStep(step?.Resource) && !isStepFunctionInvocation(step?.Resource)) {
        // inject context into default Lambda API steps and Step Function invocation steps
        continue;
      }
      if (isDefaultLambdaApiStep(step?.Resource)) {
        if (typeof step.Parameters === "object") {
          if (isSafeToModifyStepFunctionLambdaInvocation(step.Parameters)) {
            step.Parameters!["Payload.$"] = "States.JsonMerge($$, $, false)";
            serverless.cli.log(
              `JsonMerge Step Functions context object with payload in step: ${stepName} of state machine: ${stateMachineName}.`,
            );
          } else {
            serverless.cli.log(
              `[Warn] Parameters.Payload has been set. Merging traces failed for step: ${stepName} of state machine: ${stateMachineName}`,
            );
          }
        }
      } else if (isStepFunctionInvocation(step?.Resource)) {
        if (isSafeToModifyStepFunctionInvoctation(step?.Parameters)) {
          if (step.Parameters && !step.Parameters.Input) {
            step.Parameters.Input = {};
          }
          step.Parameters!.Input!["CONTEXT.$"] = "States.JsonMerge($$, $, false)";
        }
      }
    }
  }
  if (typeof definitionString !== "string") {
    definitionString["Fn::Sub"][0] = JSON.stringify(definitionObj); // writing back to the original JSON created by Serverless framework
  } else {
    definitionString = JSON.stringify(definitionObj);
  }
  return definitionString; // return the definitionString so it can be written to the Resource in span-link.ts
}

export function inspectAndRecommendStepFunctionsInstrumentation(serverless: Serverless) {
  const stepFunctions = Object.values((serverless.service as any).stepFunctions?.stateMachines || {});
  if (stepFunctions.length !== 0) {
    serverless.cli.log(
      `Uninstrumented Step Functions detected in your serverless.yml file. If you would like to see Step Functions traces, please see details of 'enableStepFunctionsTracing' and 'mergeStepFunctionAndLambdaTraces' variables in the README (https://github.com/DataDog/serverless-plugin-datadog/)`,
    );
  }
}
