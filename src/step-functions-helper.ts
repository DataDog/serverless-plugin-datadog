import Serverless from "serverless";

export function isSafeToModifyStepFunctionsDefinition(parameters: any): boolean {
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

export interface GeneralResource {
  Type: string;
  Properties?: {
    DefinitionString?: {
      "Fn::Sub": any[];
    };
  };
}

export interface StateMachineDefinition {
  States: { [key: string]: StateMachineStep };
}

export interface StateMachineStep {
  Resource: string;
  Parameters?: {
    FunctionName?: string;
    "Payload.$"?: string;
  };
  Next?: string;
  End?: boolean;
}

export function isDefaultLambdaApiStep(resource: string | null): boolean {
  // default means not legacy lambda api
  if (resource == null) {
    return false;
  }
  if (resource === "arn:aws:states:::lambda:invoke") {
    // Legacy Lambda API resource.startsWith("arn:aws:lambda"), but it cannot inject context obj.
    return true;
  }
  return false;
}

export function updateDefinitionString(
  definitionString: { "Fn::Sub": (string | object)[] },
  serverless: Serverless,
  stateMachineName: string,
): void {
  if (
    !(typeof definitionString === "object" && "Fn::Sub" in definitionString && definitionString["Fn::Sub"].length > 0)
  ) {
    return;
  }
  const unparsedDefinition = definitionString["Fn::Sub"] ? definitionString["Fn::Sub"][0] : ""; // index 0 should always be a string of step functions definition
  if (unparsedDefinition === "") {
    return;
  }
  const definitionObj: StateMachineDefinition = JSON.parse(unparsedDefinition as string);

  const states = definitionObj.States;
  for (const stepName in states) {
    if (states.hasOwnProperty(stepName)) {
      const step: StateMachineStep = states[stepName];
      if (!isDefaultLambdaApiStep(step.Resource)) {
        // only default lambda api allows context injection
        continue;
      }
      if (typeof step.Parameters === "object") {
        if (isSafeToModifyStepFunctionsDefinition(step.Parameters)) {
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
    }
  }
  definitionString["Fn::Sub"][0] = JSON.stringify(definitionObj); // writing back to the original JSON created by Serverless framework
}
