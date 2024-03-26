import * as Serverless from "serverless";
import { FunctionInfo } from "./layer";

const yellowFont = "\x1b[33m";
const underlineFont = "\x1b[4m";
const endFont = "\x1b[0m";
const outputPrefix = "DatadogMonitor";

/**
 * Builds the CloudFormation Outputs containing the alphanumeric key, description,
 * and value (URL) to the function in Datadog
 */
export async function addOutputLinks(
  serverless: Serverless,
  site: string,
  subdomain: string,
  handlers: FunctionInfo[],
) {
  const awsAccount = await serverless.getProvider("aws").getAccountId();
  const region = serverless.service.provider.region;
  const outputs = serverless.service.provider.compiledCloudFormationTemplate?.Outputs;
  if (outputs === undefined) {
    return;
  }

  handlers.forEach(({ name, handler }) => {
    const functionName = handler.name;
    const key = `${outputPrefix}${name}`.replace(/[^a-z0-9]/gi, "");
    outputs[key] = {
      Description: `See ${name} in Datadog`,
      Value: `https://${subdomain}.${site}/functions?cloud=aws&entity_view=lambda_functions&selection=aws-lambda-functions%2B${functionName?.toLowerCase()}%2B${region}%2B${awsAccount}`,
    };
  });
}

export async function printOutputs(
  serverless: Serverless,
  site: string,
  subdomain: string,
  service: string,
  env: string,
) {
  const stackName = serverless.getProvider("aws").naming.getStackName();
  const describeStackOutput = await serverless
    .getProvider("aws")
    .request(
      "CloudFormation",
      "describeStacks",
      { StackName: stackName },
      { region: serverless.getProvider("aws").getRegion() },
    )
    .catch(() => {
      // Ignore any request exceptions, fail silently and skip output logging
    });
  if (describeStackOutput === undefined) {
    return;
  }

  logHeader("Datadog Monitoring", true);
  logHeader("functions");

  for (const output of describeStackOutput.Stacks[0].Outputs) {
    if (output.OutputKey.startsWith(outputPrefix)) {
      const key = output.OutputKey.substring(outputPrefix.length);
      logMessage(`${key}: ${output.OutputValue}`);
    }
  }
  logHeader("View Serverless Monitors", true);
  logMessage(
    `https://${subdomain}.${site}/monitors/manage?q=tag%3A%28%22env%3A${env}%22%20AND%20%22service%3A${service}%22%29`,
  );
}

function logHeader(message: string, underline = false) {
  const startFont = underline ? `${yellowFont}${underlineFont}` : `${yellowFont}`;
  console.log(`${startFont}${message}${endFont}`);
}

function logMessage(message: string) {
  console.log(`  ${message}`);
}
