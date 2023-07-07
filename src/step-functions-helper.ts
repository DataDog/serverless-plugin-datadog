import Serverless from "serverless";
import {
  isDefaultLambdaApiStep,
  isSafeToModifyStepFunctionsDefinition,
  StateMachineDefinition, StateMachineStep
} from "./forwarder";


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
  const unparsedDefinition = definitionString["Fn::Sub"]?definitionString["Fn::Sub"][0]:"";  // index 0 should always be a string of step functions definition
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
          step.Parameters["Payload.$"] = "States.JsonMerge($$, $, false)";
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
