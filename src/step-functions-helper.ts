import Serverless from "serverless";

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

export type PayloadObject = {
  "Execution.$"?: any;
  Execution?: any;
  "State.$"?: any;
  State?: any;
  "StateMachine.$"?: any;
  StateMachine?: any;
};

export type StepFunctionInput = {
  "CONTEXT.$"?: string;
  CONTEXT?: string;
  [key: string]: unknown;
};

export interface StateMachineStep {
  Resource?: string;
  Parameters?: {
    FunctionName?: string;
    "Payload.$"?: string;
    Payload?: string | PayloadObject;
    Input?: string | StepFunctionInput;
  };
  Next?: string;
  End?: boolean;
}

export function isLambdaApiStep(resource: string | undefined): boolean {
  // Allow for either the standard or legacy definitions of a lambda step
  return (
    resource !== undefined &&
    (resource?.startsWith("arn:aws:states:::lambda:invoke") || resource?.startsWith("arn:aws:lambda"))
  );
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
    // only inject context into Lambda API steps and Step Function invocation steps
    if (isLambdaApiStep(step?.Resource)) {
      updateDefinitionForDefaultLambdaApiStep(stepName, step, serverless, stateMachineName);
    } else if (isStepFunctionInvocation(step?.Resource)) {
      updateDefinitionForStepFunctionInvocationStep(stepName, step, serverless, stateMachineName);
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

// Truth table
// Case | Input                                                    | Will update
// -----|----------------------------------------------------------|-------------
//   1  | No "Payload" or "Payload.$"                              | true
//  2.1 | "Payload" is object, already injected                    | false
//  2.2 | "Payload" object has Execution, State or StateMachine    | false
//  2.3 | "Payload" object has no Execution, State or StateMachine | true
//   3  | "Payload" is not object                                  | false
//  4.1 | "Payload.$": "$" (default payload)                       | true
//  4.2 | "Payload.$": "States.JsonMerge($$, $, false)" or         | false
//      | "Payload.$": "$$['Execution', 'State', 'StateMachine']"  |
//  4.3 | Custom "Payload.$"                                       | false
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

  // Case 2 & 3: Parameters has "Payload" field
  if (step.Parameters.hasOwnProperty("Payload")) {
    const payload = step.Parameters.Payload;

    // Case 3: payload is not a JSON object
    if (typeof payload !== "object") {
      serverless.cli.log(
        `[Warn] Payload field is not a JSON object. Merging traces failed for step: ${stepName} of state machine: ${stateMachineName}. \
  Your Step Functions trace will not be merged with downstream Lambda traces. To manually merge these traces, check out \
  https://docs.datadoghq.com/serverless/step_functions/troubleshooting/`,
      );
      return;
    }

    // Case 2: payload is a JSON object
    if (
      payload["Execution.$"] === "$$.Execution" &&
      payload["State.$"] === "$$.State" &&
      payload["StateMachine.$"] === "$$.StateMachine"
    ) {
      // Case 2.1: already injected into "Payload"
      serverless.cli.log(
        `Context injection is already set up. Skipping merging traces for step: ${stepName} of state machine: ${stateMachineName}.\n`,
      );

      return;
    }

    // Case 2.2: "Payload" object has Execution, State or StateMachine field but conject injection is not set up completely
    if (
      payload.hasOwnProperty("Execution.$") ||
      payload.hasOwnProperty("Execution") ||
      payload.hasOwnProperty("State.$") ||
      payload.hasOwnProperty("State") ||
      payload.hasOwnProperty("StateMachine.$") ||
      payload.hasOwnProperty("StateMachine")
    ) {
      serverless.cli
        .log(`[Warn] Step ${stepName} of state machine: ${stateMachineName} may be using custom Execution, State or StateMachine field. \
Step Functions Context Object injection skipped. Your Step Functions trace will not be merged with downstream Lambda traces. To manually \
merge these traces, check out https://docs.datadoghq.com/serverless/step_functions/troubleshooting/\n`);

      return;
    }

    // Case 2.3: "Payload" object has no Execution, State or StateMachine field
    payload["Execution.$"] = "$$.Execution";
    payload["State.$"] = "$$.State";
    payload["StateMachine.$"] = "$$.StateMachine";

    return;
  }

  // Case 4: Parameters has "Payload.$" field
  if (step.Parameters.hasOwnProperty("Payload.$")) {
    // Case 4.1: default "Payload.$"
    if (step.Parameters["Payload.$"] === "$") {
      step.Parameters!["Payload.$"] = "States.JsonMerge($$, $, false)";
      serverless.cli.log(
        `JsonMerge Step Functions context object with payload in step: ${stepName} of state machine: ${stateMachineName}.`,
      );
      return;
    }

    // Case 4.2: context injection is already set up using "Payload.$"
    if (
      step.Parameters["Payload.$"] === "States.JsonMerge($$, $, false)" ||
      step.Parameters["Payload.$"] === "$$['Execution', 'State', 'StateMachine']"
    ) {
      serverless.cli.log(
        `Step ${stepName} of state machine ${stateMachineName}: Context injection is already set up. Skipping context injection.\n`,
      );

      return;
    }

    // Case 4.3: custom "Payload.$"
    serverless.cli.log(
      `[Warn] Step ${stepName} of state machine ${stateMachineName} has a custom Payload field. Step Functions Context Object injection \
skipped. Your Step Functions trace will not be merged with downstream Lambda traces. To manually merge these traces, \
check out https://docs.datadoghq.com/serverless/step_functions/troubleshooting/\n`,
    );
    return;
  }

  // Case 1: No "Payload" or "Payload.$"
  step.Parameters!["Payload.$"] = "$$['Execution', 'State', 'StateMachine']";
  serverless.cli.log(`Merging traces for step: ${stepName} of state machine: ${stateMachineName}.`);
}

// Truth table
// Input                    | Expected
// -------------------------|---------
// Empty object             | true
// undefined                | true
// not object               | false
// object without CONTEXT.$ | true
// object with CONTEXT.$    | false

// Truth table
// Case | Input                                                    | Expected
// -----|----------------------------------------------------------|---------
//  0.1 | Parameters field is not an object                        | false
//  0.2 | Parameters field has no Input field                      | true
//  0.3 | Parameters.Input is not an object                        | false
//  0.4 | Parameters field has "Input.$" field                     | false
//   1  | No "CONTEXT" or "CONTEXT.$"                              | true
//   2  | Has "CONTEXT"                                            | false
//  3.1 | "CONTEXT.$": "States.JsonMerge($$, $, false)" or         | false
//      | "CONTEXT.$": "$$['Execution', 'State', 'StateMachine']"  |
//  3.2 | Custom "CONTEXT.$"                                       | false
export function updateDefinitionForStepFunctionInvocationStep(
  stepName: string,
  step: StateMachineStep,
  serverless: Serverless,
  stateMachineName: string,
): boolean {
  const parameters = step?.Parameters;

  // Case 0.1: Parameters field is not an object
  if (typeof parameters !== "object") {
    return false;
  }

  // Case 0.4: Parameters field has "Input.$" field
  if (parameters.hasOwnProperty("Input.$")) {
    serverless.cli
      .log(`[Warn] Step ${stepName} of state machine ${stateMachineName} has custom "Input.$" field. Step Functions Context \
Object injection skipped. Your Step Functions trace will not be merged with downstream Step Function traces. To manually \
merge these traces, check out https://docs.datadoghq.com/serverless/step_functions/troubleshooting/ and \
https://github.com/DataDog/serverless-plugin-datadog/issues/584\n`);
    return false;
  }

  // Case 0.2: Parameters field has no Input field
  if (!parameters.hasOwnProperty("Input")) {
    parameters.Input = { "CONTEXT.$": "States.JsonMerge($$, $, false)" };
    return true;
  }

  // Case 0.3: Parameters.Input is not an object
  if (typeof parameters.Input !== "object") {
    return false;
  }

  // Case 1: No "CONTEXT" or "CONTEXT.$"
  if (!parameters.Input.hasOwnProperty("CONTEXT") && !parameters.Input.hasOwnProperty("CONTEXT.$")) {
    parameters.Input["CONTEXT.$"] = "$$['Execution', 'State', 'StateMachine']";
    return true;
  }

  // Case 2: Has 'CONTEXT' field.
  // This case should be rare, so we don't support context injection for this case for now.
  if (parameters.Input.hasOwnProperty("CONTEXT")) {
    serverless.cli
      .log(`[Warn] Step ${stepName} of state machine ${stateMachineName} has custom CONTEXT field. Step Functions Context \
Object injection skipped. Your Step Functions trace will not be merged with downstream Step Function traces. To manually \
merge these traces, check out https://docs.datadoghq.com/serverless/step_functions/troubleshooting/\n`);

    return false;
  }

  // Case 3.1 context injection is already set up
  if (
    parameters.Input["CONTEXT.$"] === "States.JsonMerge($$, $, false)" ||
    parameters.Input["CONTEXT.$"] === `$$['Execution', 'State', 'StateMachine']`
  ) {
    serverless.cli.log(
      `Step ${stepName} of state machine ${stateMachineName}: Context injection is already set up. Skipping context injection.\n`,
    );

    return false;
  }

  // Case 3.2 custom CONTEXT.$ field
  serverless.cli
    .log(`[Warn] Step ${stepName} of state machine ${stateMachineName}: Parameters.Input field has a custom CONTEXT.$ field. Step \
Functions Context Object injection skipped. Your Step Functions trace will not be merged with downstream Step Function traces. To \
manually merge these traces, check out https://docs.datadoghq.com/serverless/step_functions/troubleshooting/\n`);

  return false;
}

export function inspectAndRecommendStepFunctionsInstrumentation(serverless: Serverless): void {
  const stepFunctions = Object.values((serverless.service as any).stepFunctions?.stateMachines || {});
  if (stepFunctions.length !== 0) {
    serverless.cli.log(
      `Uninstrumented Step Functions detected in your serverless.yml file. If you would like to see Step Functions traces, please see details of 'enableStepFunctionsTracing' and 'mergeStepFunctionAndLambdaTraces' variables in the README (https://github.com/DataDog/serverless-plugin-datadog/)`,
    );
  }
}
