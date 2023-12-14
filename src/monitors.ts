import {
  updateMonitor,
  createMonitor,
  deleteMonitor,
  getExistingMonitors,
  getRecommendedMonitors,
} from "./monitor-api-requests";
import { Response } from "node-fetch";

export interface MonitorParams {
  [key: string]: any;
}
export interface Monitor {
  [key: string]: MonitorParams;
}

export interface ServerlessMonitor {
  name: string;
  threshold: number;
  query: (cloudFormationStackId: string, criticalThreshold: number) => string;
  message: string;
  type?: string;
}

export interface RecommendedMonitors {
  [key: string]: ServerlessMonitor;
}
/**
 * Adds the appropriate tags and required parameters that will be passed as part of the request body for creating and updating monitors
 * @param monitor - the Monitor object that is defined in the serverless.yml file
 * @param cloudFormationStackId - the Cloud Formation Stack ID
 * @param service - the Service
 * @param env  - the Environment
 * @returns valid monitor parameters
 */
export function buildMonitorParams(
  monitor: Monitor,
  cloudFormationStackId: string,
  service: string,
  env: string,
  recommendedMonitors: RecommendedMonitors,
) {
  const serverlessMonitorId = Object.keys(monitor)[0];

  if (!monitor[serverlessMonitorId]) {
    monitor[serverlessMonitorId] = {};
  }

  const monitorParams = { ...monitor[serverlessMonitorId] };

  if (!monitorParams.tags) {
    monitorParams.tags = [];
  }
  if (!monitorParams.options) {
    monitorParams.options = {};
  }
  if (monitorParams.type === undefined) {
    monitorParams.type = "metric alert";
  }

  monitorParams.tags = [
    ...monitorParams.tags,
    "serverless_monitor_type:single_function",
    `serverless_monitor_id:${serverlessMonitorId}`,
    `aws_cloudformation_stack-id:${cloudFormationStackId}`,
    "created_by:dd_sls_plugin",
    `env:${env}`,
    `service:${service}`,
  ];

  console.log(recommendedMonitors); 
  console.log(serverlessMonitorId);
  if (isRecommendedMonitor(serverlessMonitorId, recommendedMonitors)) {
    let criticalThreshold = recommendedMonitors[serverlessMonitorId].threshold;

    if (monitorParams.options) {
      if (monitorParams.options.thresholds) {
        if (monitorParams.options.thresholds.critical) {
          criticalThreshold = monitorParams.options.thresholds.critical;
        }
      }
    }
    monitorParams.query = recommendedMonitors[serverlessMonitorId].query(cloudFormationStackId, criticalThreshold);
    console.log(monitorParams.query);
    if (!monitorParams.message) {
      monitorParams.message = recommendedMonitors[serverlessMonitorId].message;
    }
    if (!monitorParams.name) {
      monitorParams.name = recommendedMonitors[serverlessMonitorId].name;
    }
  }

  else {
    console.log('Not recommended monitor');
  }
  return monitorParams;
}

/**
 * Checks to see if the given monitor is a serverless recommended monitor
 * @param serverlessMonitorId - Unique ID string defined for each monitor
 * @returns true if a given monitor is a serverless recommended monitor
 */
function isRecommendedMonitor(serverlessMonitorId: string, recommendedMonitors: RecommendedMonitors) {
  return Object.keys(recommendedMonitors).includes(serverlessMonitorId);
}

/**
 * Checks to see if the monitor already exists
 * @param serverlessMonitorId - Unique ID string defined for each serverless monitor
 * @param existingMonitors - Monitors that have already been created
 * @returns true if given monitor already exists
 */
function doesMonitorExist(serverlessMonitorId: string, existingMonitors: { [key: string]: number }) {
  return Object.keys(existingMonitors).includes(serverlessMonitorId);
}

/**
 * Deletes the monitors that have been removed from the plugin
 * @param pluginMonitors Monitors that are currently defined in the plugin
 * @param existingMonitors Monitors that have already been created
 * @param monitorsApiKey API Key
 * @param monitorsAppKey Application Key
 * @returns an array of successfully deleted monitors
 */
async function deleteRemovedMonitors(
  site: string,
  pluginMonitors: Monitor[],
  existingMonitors: { [key: string]: number },
  monitorsApiKey: string,
  monitorsAppKey: string,
) {
  const successfullyDeletedMonitors: string[] = [];
  const currentMonitorIds: string[] = [];
  pluginMonitors.forEach((currentMonitor) => currentMonitorIds.push(Object.keys(currentMonitor)[0]));
  for (const pluginMonitorId of Object.keys(existingMonitors)) {
    if (!currentMonitorIds.includes(pluginMonitorId)) {
      const response = await deleteMonitor(site, existingMonitors[pluginMonitorId], monitorsApiKey, monitorsAppKey);
      const successfullyDeleted = handleMonitorsApiResponse(response, pluginMonitorId);
      if (successfullyDeleted) {
        successfullyDeletedMonitors.push(` ${pluginMonitorId}`);
      }
    }
  }
  return successfullyDeletedMonitors;
}
/**
 * Handles the Monitor API response and logs the appropriate error
 * @param response Monitor API Response
 * @param serverlessMonitorId Serverless Monitor ID
 * @param subdomain
 * @param site
 */
export function handleMonitorsApiResponse(
  response: Response,
  serverlessMonitorId?: string,
  subdomain?: string,
  site?: string,
) {
  if (response.status === 200) {
    return true;
  } else if (response.status === 400) {
    throw new Error(
      `400 Bad Request: This could be due to incorrect syntax or a missing required tag for ${serverlessMonitorId}. Have you looked at your monitor tag policies? https://${subdomain}.${site}/monitors/settings/policies`,
    );
  } else {
    throw new Error(`${response.status} ${response.statusText}`);
  }
}

/**
 * Creates, updates, and deletes the appropriate monitor configurations as defined in the serverless.yml file
 * @param monitors - Monitors defined in the serverless.yml file
 * @param monitorsApiKey - the API Key
 * @param monitorsAppKey - the Application Key
 * @param cloudFormationStackId - the Cloud Formation Stack ID
 * @param service - the Service
 * @param env - the Environment
 * @returns monitors that have been successfully created, updated, and deleted according to the configuration defined in the plugin
 */
export async function setMonitors(
  subdomain: string,
  site: string,
  monitors: Monitor[],
  monitorsApiKey: string,
  monitorsAppKey: string,
  cloudFormationStackId: string,
  service: string,
  env: string,
) {
  const recommendedMonitors = await getRecommendedMonitors(site, monitorsApiKey, monitorsAppKey);
  const serverlessMonitorIdByMonitorId = await getExistingMonitors(
    site,
    cloudFormationStackId,
    monitorsApiKey,
    monitorsAppKey,
  );
  const successfullyUpdatedMonitors: string[] = [];
  const successfullyCreatedMonitors: string[] = [];

  for (const monitor of monitors) {
    const serverlessMonitorId = Object.keys(monitor)[0];
    const monitorIdNumber = serverlessMonitorIdByMonitorId[serverlessMonitorId];
    const monitorParams = buildMonitorParams(monitor, cloudFormationStackId, service, env, recommendedMonitors);
    const monitorExists = await doesMonitorExist(serverlessMonitorId, serverlessMonitorIdByMonitorId);
    if (monitorExists) {
      const response = await updateMonitor(site, monitorIdNumber, monitorParams, monitorsApiKey, monitorsAppKey);
      const successfullyCreated = handleMonitorsApiResponse(response, serverlessMonitorId, subdomain, site);
      if (successfullyCreated) {
        successfullyUpdatedMonitors.push(` ${serverlessMonitorId}`);
      }
    } else {
      const response = await createMonitor(site, monitorParams, monitorsApiKey, monitorsAppKey);
      const successfullyUpdated = handleMonitorsApiResponse(response, serverlessMonitorId, subdomain, site);
      if (successfullyUpdated) {
        successfullyCreatedMonitors.push(` ${serverlessMonitorId}`);
      }
    }
  }
  const successfullyDeletedMonitors = await deleteRemovedMonitors(
    site,
    monitors,
    serverlessMonitorIdByMonitorId,
    monitorsApiKey,
    monitorsAppKey,
  );
  const logStatements: string[] = [];
  if (successfullyUpdatedMonitors.length > 0) {
    logStatements.push(`Successfully updated${successfullyUpdatedMonitors}`);
  }
  if (successfullyCreatedMonitors.length > 0) {
    logStatements.push(`Successfully created${successfullyCreatedMonitors}`);
  }
  if (successfullyDeletedMonitors.length > 0) {
    logStatements.push(`Successfully deleted${successfullyDeletedMonitors}`);
  }
  return logStatements;
}

/** Helper function that replaces the default threshold included in the query string with the new critical threshold configured by the customer
 * @param query - the query string
 * @param criticalThreshold = new critical threshold as defined by the customer
 */
export function replaceCriticalThreshold(query: string, criticalThreshold: number) {
  const thresholdComparison = /(>=|>)(.*)$/;
  const newQuery = query.replace(thresholdComparison, `$1 ${criticalThreshold}`);

  return newQuery;
}
