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
        if (resourceObj.Properties){
          const definitionString = resourceObj.Properties?.DefinitionString!;
          var newDefString = updateDefinitionString(definitionString, serverless, resourceName);
          resourceObj.Properties.DefinitionString = newDefString;
        }
      }
    }
  }
}
