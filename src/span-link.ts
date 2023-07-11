import { GeneralResource, updateDefinitionString } from "./step-functions-helper";
import * as Serverless from "serverless";

export function mergeStepFunctionAndLambdaTraces(
  resources: { [key: string]: GeneralResource },
  serverless: Serverless,
) {
  for (const resourceName in resources) {
    if (resources.hasOwnProperty(resourceName)) {
      const resourceObj: GeneralResource = resources[resourceName];
      if (resourceObj.Type === "AWS::StepFunctions::StateMachine") {
        const definitionString = resourceObj.Properties?.DefinitionString!;
        updateDefinitionString(definitionString, serverless, resourceName);
      }
    }
  }
}
