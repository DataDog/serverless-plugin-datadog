import fetch, { Response } from "node-fetch";
import * as Serverless from "serverless";
import { MonitorParams, ServerlessMonitor, replaceCriticalThreshold } from "./monitors";

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

interface RecommendedMonitorParams {
  id: string;
  attributes: {
    query: string;
    message: string;
    description: string;
    type: string;
    options: {
      thresholds: { critical: number };
    };
    name: string;
  };
}

export async function createMonitor(
  site: string,
  monitorParams: MonitorParams,
  monitorsApiKey: string,
  monitorsAppKey: string,
) {
  const response: Response = await fetch(`https://api.${site}/api/v1/monitor`, {
    method: "POST",
    headers: {
      "DD-API-KEY": monitorsApiKey,
      "DD-APPLICATION-KEY": monitorsAppKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(monitorParams),
  });
  // console.log(JSON.stringify(monitorParams));
  // console.log(response);
  return response;
}

export async function updateMonitor(
  site: string,
  monitorId: number,
  monitorParams: MonitorParams,
  monitorsApiKey: string,
  monitorsAppKey: string,
) {
  const response: Response = await fetch(`https://api.${site}/api/v1/monitor/${monitorId}`, {
    method: "PUT",
    headers: {
      "DD-API-KEY": monitorsApiKey,
      "DD-APPLICATION-KEY": monitorsAppKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(monitorParams),
  });

  return response;
}

export async function deleteMonitor(site: string, monitorId: number, monitorsApiKey: string, monitorsAppKey: string) {
  const response: Response = await fetch(`https://api.${site}/api/v1/monitor/${monitorId}`, {
    method: "DELETE",
    headers: {
      "DD-API-KEY": monitorsApiKey,
      "DD-APPLICATION-KEY": monitorsAppKey,
      "Content-Type": "application/json",
    },
  });

  return response;
}

export async function searchMonitors(site: string, queryTag: string, monitorsApiKey: string, monitorsAppKey: string) {
  let monitors: QueriedMonitor[] = [];
  let page = 0;
  let pageCount = 1;
  do {
    const query = `tag:"${queryTag}"`;
    const response: Response = await fetch(`https://api.${site}/api/v1/monitor/search?query=${query}&page=${page}`, {
      method: "GET",
      headers: {
        "DD-API-KEY": monitorsApiKey,
        "DD-APPLICATION-KEY": monitorsAppKey,
        "Content-Type": "application/json",
      },
    });

    if (response.status !== 200) {
      throw new Error(`Can't fetch monitors. Status code: ${response.status}. Message: ${response.statusText}`);
    }

    const json = await response.json();
    monitors = monitors.concat(json.monitors);
    pageCount = json.metadata.page_count;
    page += 1;
  } while (page < pageCount);

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
    .catch(() => {
      // Ignore any request exceptions, fail silently and skip output logging
    });
  const cloudFormationStackId: string = describeStackOutput ? describeStackOutput.Stacks[0].StackId : "";
  return cloudFormationStackId;
}

export async function getExistingMonitors(
  site: string,
  cloudFormationStackId: string,
  monitorsApiKey: string,
  monitorsAppKey: string,
) {
  const existingMonitors = await searchMonitors(
    site,
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

export async function getRecommendedMonitors(site: string, monitorsApiKey: string, monitorsAppKey: string) {
  let recommendedMonitors: { [key: string]: ServerlessMonitor } = {};
  const endpoint = `https://api.${site}/api/v2/monitor/recommended?count=50&start=0&search=tag%3A%22product%3Aserverless%22`;
  const response: Response = await fetch(endpoint, {
    method: "GET",
    headers: {
      "DD-API-KEY": monitorsApiKey,
      "DD-APPLICATION-KEY": monitorsAppKey,
      "Content-Type": "application/json",
    },
  });
  if (response.status !== 200) {
    throw new Error(`Can't fetch monitor params. Status code: ${response.status}. Message: ${response.statusText}`);
  }

  let json = await response.json();
  const recommendedMonitorsData = json.data;
  recommendedMonitorsData.forEach((recommendedMonitorParam: RecommendedMonitorParams) => {
    const recommendedMonitor: ServerlessMonitor = {
      name: recommendedMonitorParam.attributes.name,
      threshold: recommendedMonitorParam.attributes.options.thresholds.critical,
      message: recommendedMonitorParam.attributes.message,
      type: recommendedMonitorParam.attributes.type,
      query: (cloudFormationStackId: string, criticalThreshold: number) => {
        let query = recommendedMonitorParam.attributes.query;
        query = query.replace(/\$scope*/g, `aws_coudformation_stack-id:${cloudFormationStackId}`);
        if (criticalThreshold !== recommendedMonitorParam.attributes.options.thresholds.critical) {
          query = replaceCriticalThreshold(query, criticalThreshold);
        }
        return query;
      },
    };

    // recommended monitor params have an id that includes a serverless_ prefix that we have to remove to match the monitor ids we use in the plugin
    const recommendedMonitorId = recommendedMonitorParam.id.replace("serverless_", "");
    recommendedMonitors[recommendedMonitorId] = recommendedMonitor;
  });

  return recommendedMonitors;
}
