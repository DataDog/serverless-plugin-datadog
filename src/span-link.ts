import { GeneralResource, updateDefinitionString } from "./step-functions-helper";
import * as Serverless from "serverless";

export function mergeStepFunctionAndLambdaTraces(
  resources: { [key: string]: GeneralResource },
  serverless: Serverless,
): void {
  for (const [resourceName, resourceObj] of Object.entries(resources)) {
    if (resourceObj.Type !== "AWS::StepFunctions::StateMachine" || !resourceObj.Properties) {
      continue;
    }
    const definitionString = resourceObj.Properties?.DefinitionString!;
    const newDefString = updateDefinitionString(definitionString, serverless, resourceName);
    resourceObj.Properties.DefinitionString = newDefString;
  }
}
