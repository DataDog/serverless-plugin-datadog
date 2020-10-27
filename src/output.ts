import * as Serverless from "serverless";

const yellowFont = "\x1b[33m"
const underlineFont = "\x1b[4m";
const endFont = "\x1b[0m";
const outputPrefix = "DatadogMonitor";

/**
 * Builds the CloudFormation Outputs containing the alphanumeric key, description,
 * and value (URL) to the function in Datadog
 */
export async function addOutputLinks(serverless: Serverless, site: string) {
  const awsAccount = await serverless.getProvider("aws").getAccountId();
  const region = serverless.service.provider.region;
  const outputs = serverless.service.provider.compiledCloudFormationTemplate.Outputs;
  if(outputs === undefined) {
    return;
  }

  serverless.service.getAllFunctions().forEach((functionKey) => {
    const functionName = serverless.service.getFunction(functionKey).name;
    const key = `${outputPrefix}${functionKey}`.replace(/[^a-z0-9]/gi,'');
    outputs[key] = {
      Description: `See ${functionKey} in Datadog`,
      Value: `https://app.${site}/functions/${functionName}:${region}:${awsAccount}:aws?source=sls-plugin`,
    };
  });
}

export async function printOutputs(serverless: Serverless) {
  const stackName = `${serverless.service.getServiceName()}-${serverless.getProvider('aws').getStage()}`;
  const describeStackOutput = await serverless.getProvider('aws').request(
    'CloudFormation',
    'describeStacks',
    { StackName: stackName },
    { region: serverless.getProvider('aws').getRegion() },
  );

  logHeader("Datadog Monitoring", true);
  logHeader("functions");

  for(const output of describeStackOutput.Stacks[0].Outputs) {
    if(output.OutputKey.startsWith(outputPrefix)) {
      const key = output.OutputKey.substring(outputPrefix.length);
      logMessage(`${key}: ${output.OutputValue}`);
    }
  }
}

function logHeader(message:string, underline=false) {
  const startFont = underline ? `${yellowFont}${underlineFont}` : `${yellowFont}`
  console.log(`${startFont}${message}${endFont}`);
}

function logMessage(message: string) {
  console.log(`  ${message}`);
}
