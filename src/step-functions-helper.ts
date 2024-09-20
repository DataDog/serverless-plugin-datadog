import Serverless from "serverless";

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
  return resource.startsWith("arn:aws:states:::states:startExecution");
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
  // Step 1: Parse definition object from definition string
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

  // Step 2: Mutate the definition object
  const states = definitionObj.States;
  for (const [stepName, step] of Object.entries(states)) {
    // only inject context into default Lambda API steps and Step Function invocation steps
    if (isDefaultLambdaApiStep(step?.Resource)) {
      updateDefinitionForDefaultLambdaApiStep(stepName, step, serverless, stateMachineName);
    } else if (isStepFunctionInvocation(step?.Resource)) {
      updateDefinitionForStepFunctionInvocationStep(step);
    }
  }

  // Step 3: Convert definition object back into definition string
  if (typeof definitionString !== "string") {
    definitionString["Fn::Sub"][0] = JSON.stringify(definitionObj); // writing back to the original JSON created by Serverless framework
  } else {
    definitionString = JSON.stringify(definitionObj);
  }
  return definitionString; // return the definitionString so it can be written to the Resource in span-link.ts
}

function updateDefinitionForDefaultLambdaApiStep(
  stepName: string,
  step: StateMachineStep,
  serverless: Serverless,
  stateMachineName: string,
): void {
  if (typeof step.Parameters !== "object") {
    serverless.cli.log(
      `[Warn] Parameters field is not a JSON object. Merging traces failed for step: ${stepName} of state machine: ${stateMachineName}. \
Your Step Functions trace will not be merged with downstream Lambda traces. To manually merge these traces, check out \
https://docs.datadoghq.com/serverless/step_functions/troubleshooting/`,
    );
    return;
  }

  if (!step.Parameters.hasOwnProperty("Payload.$")) {
    step.Parameters!["Payload.$"] = "States.JsonMerge($$, $, false)";
    serverless.cli.log(
      `JsonMerge Step Functions context object with payload in step: ${stepName} of state machine: ${stateMachineName}.`,
    );
    return;
  }

  if (step.Parameters["Payload.$"] === "$") {
    // $ % is the default original unchanged payload
    step.Parameters!["Payload.$"] = "States.JsonMerge($$, $, false)";
    serverless.cli.log(
      `JsonMerge Step Functions context object with payload in step: ${stepName} of state machine: ${stateMachineName}.`,
    );
    return;
  }

  serverless.cli.log(
    `[Warn] Parameters.Payload has been set. Merging traces failed for step: ${stepName} of state machine: ${stateMachineName}`,
  );
}

function updateDefinitionForStepFunctionInvocationStep(step: StateMachineStep): void {
  if (isSafeToModifyStepFunctionInvoctation(step?.Parameters)) {
    if (step.Parameters && !step.Parameters.Input) {
      step.Parameters.Input = {};
    }
    step.Parameters!.Input!["CONTEXT.$"] = "States.JsonMerge($$, $, false)";
  }
}

export function inspectAndRecommendStepFunctionsInstrumentation(serverless: Serverless): void {
  const stepFunctions = Object.values((serverless.service as any).stepFunctions?.stateMachines || {});
  if (stepFunctions.length !== 0) {
    serverless.cli.log(
      `Uninstrumented Step Functions detected in your serverless.yml file. If you would like to see Step Functions traces, please see details of 'enableStepFunctionsTracing' and 'mergeStepFunctionAndLambdaTraces' variables in the README (https://github.com/DataDog/serverless-plugin-datadog/)`,
    );
  }
}
