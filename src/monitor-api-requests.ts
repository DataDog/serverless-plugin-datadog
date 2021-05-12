import { MonitorParams } from "monitors";
import { Response } from "node-fetch";
import * as Serverless from "serverless";
import fetch from "node-fetch";

export class InvalidAuthenticationError extends Error {
  constructor(message: string) {
    super(...message);
    this.name = "Invalid Authentication Error";
    this.message = message;
  }
}

interface QueriedMonitor {
  query: string;
  id: number;
  name: string;
  tags: string[];
}

// export async function createMonitor(
//   serverlessMonitorId: string,
//   monitorParams: MonitorParams,
//   monitorsApiKey: string,
//   monitorsAppKey: string,
// ) {
export async function createMonitor(
  monitorParams: MonitorParams,
  monitorsApiKey: string,
  monitorsAppKey: string,
) {
  const response: Response = await fetch("https://api.datadoghq.com/api/v1/monitor", {
    method: "POST",
    headers: {
      "DD-API-KEY": monitorsApiKey,
      "DD-APPLICATION-KEY": monitorsAppKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(monitorParams),
  });

  return response.status;
  // if (response.status === 200) {
  //   return true;
  // } else if (response.status === 403) {
  //   throw new InvalidAuthenticationError("Could not perform request due to invalid authentication");
  // } else if (response.status === 400) {
  //   console.log(`Invalid Syntax Error: Could not perform request due to incorrect syntax for ${serverlessMonitorId}`);
  // }
  // return false;
}

// export async function updateMonitor(
//   monitorId: number,
//   serverlessMonitorId: string,
//   monitorParams: MonitorParams,
//   monitorsApiKey: string,
//   monitorsAppKey: string,
// ) {
  export async function updateMonitor(
    monitorId: number,
    monitorParams: MonitorParams,
    monitorsApiKey: string,
    monitorsAppKey: string,
  ) {
  const response: Response = await fetch(`https://api.datadoghq.com/api/v1/monitor/${monitorId}`, {
    method: "PUT",
    headers: {
      "DD-API-KEY": monitorsApiKey,
      "DD-APPLICATION-KEY": monitorsAppKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(monitorParams),
  });

  // if (response.status === 200) {
  //   return true;
  // } else if (response.status === 403) {
  //   throw new InvalidAuthenticationError("Could not perform request due to invalid authentication");
  // } else if (response.status === 400) {
  //   console.log(`Invalid Syntax Error: Could not perform request due to incorrect syntax for ${serverlessMonitorId}`);
  // }

  // return false;
  return response.status;
}

export async function deleteMonitor(
  monitorId: number,
  serverlessMonitorId: string,
  monitorsApiKey: string,
  monitorsAppKey: string,
) {
  const response: Response = await fetch(`https://api.datadoghq.com/api/v1/monitor/${monitorId}`, {
    method: "DELETE",
    headers: {
      "DD-API-KEY": monitorsApiKey,
      "DD-APPLICATION-KEY": monitorsAppKey,
      "Content-Type": "application/json",
    },
  });

  if (response.status === 200) {
    return true;
  } else if (response.status === 403) {
    throw new InvalidAuthenticationError("Could not perform request due to invalid authentication");
  }
  // } else if (response.status === 400) {
  //   console.log(`Invalid Syntax Error: Could not perform request due to incorrect syntax for ${serverlessMonitorId}`);
  // }

  return false;
}

export async function searchMonitors(queryTag: string, monitorsApiKey: string, monitorsAppKey: string) {
  const query = `tag:"${queryTag}"`;
  const response: Response = await fetch(`https://api.datadoghq.com/api/v1/monitor/search?query=${query}`, {
    method: "GET",
    headers: {
      "DD-API-KEY": monitorsApiKey,
      "DD-APPLICATION-KEY": monitorsAppKey,
      "Content-Type": "application/json",
    },
  });
  
  if (response.status === 403) {
    throw new InvalidAuthenticationError("Could not perform request due to invalid authentication");
  }

  const json = await response.json();
  const monitors: QueriedMonitor[] = json.monitors;

  return monitors;
}

export async function getCloudFormationStackId(serverless: Serverless) {
  const stackName = serverless.getProvider("aws").naming.getStackName();
  const describeStackOutput = await serverless
    .getProvider("aws")
    .request(
      "CloudFormation",
      "describeStacks",
      { StackName: stackName },
      { region: serverless.getProvider("aws").getRegion() },
    )
    .catch((err) => {
      // Ignore any request exceptions, fail silently and skip output logging
    });
  const cloudFormationStackId: string = describeStackOutput ? describeStackOutput.Stacks[0].StackId : "";
  return cloudFormationStackId;
}

export async function getExistingMonitors(
  cloudFormationStackId: string,
  monitorsApiKey: string,
  monitorsAppKey: string,
) {
  const existingMonitors = await searchMonitors(
    `aws_cloudformation_stack-id:${cloudFormationStackId}`,
    monitorsApiKey,
    monitorsAppKey,
  );
  const serverlessMonitorIdByMonitorId: { [key: string]: number } = {};
  for (const existingMonitor of existingMonitors) {
    for (const tag of existingMonitor.tags) {
      if (tag.startsWith("serverless_monitor_id:")) {
        const serverlessMonitorId = tag.substring(tag.indexOf(":") + 1);
        serverlessMonitorIdByMonitorId[serverlessMonitorId] = existingMonitor.id;
      }
    }
  }
  return serverlessMonitorIdByMonitorId;
}
