import { SERVERLESS_MONITORS } from "./serverless_monitors"
import { updateMonitor, createMonitor, deleteMonitor, getExistingMonitors } from "./monitor-api-requests";

export interface MonitorParams {
  [key: string]: any;
}
export interface Monitor {
  [key: string]: MonitorParams;
}

/**
 * 
 * @param monitor Monitor Object that is defined in the serverless.yml file
 * @param cloudFormationStackId Cloud Formation Stack ID 
 * @param service Service
 * @param env Env
 * @returns valid monitor parameters to pass into the API call 
 */
export function buildMonitorParams(monitor: Monitor, cloudFormationStackId: string, service: string, env: string) {
  const serverlessMonitorId = Object.keys(monitor)[0];

  if (!monitor[serverlessMonitorId]) {
    monitor[serverlessMonitorId] = {};
  }

  const monitorParams = { ...monitor[serverlessMonitorId] };

  if (!monitorParams.tags) {
    monitorParams.tags = [];
  }
  if (!monitorParams.options) {
    monitorParams.options = {}
  }
  if (monitorParams.type === undefined) {
    monitorParams.type = "metric alert";
  }

  monitorParams.tags = [...monitorParams.tags, "serverless_monitor_type:single_function", `serverless_monitor_id:${serverlessMonitorId}`, `aws_cloudformation_stack-id:${cloudFormationStackId}`, "created_by:dd_sls_plugin", `env:${env}`, `service:${service}`];

  if (checkIfServerlessMonitor(serverlessMonitorId)) {
    monitorParams.query = SERVERLESS_MONITORS[serverlessMonitorId].query(cloudFormationStackId);

    if (!monitorParams.message) {
      monitorParams.message = SERVERLESS_MONITORS[serverlessMonitorId].message;
    }
    if (!monitorParams.name) {
      monitorParams.name = SERVERLESS_MONITORS[serverlessMonitorId].name;
    }
  }
  return monitorParams;
}

/**
 * 
 * @param serverlessMonitorId Unique ID string defined for each serverless monitor
 * @returns true if a given monitor is a serverless recommended monitor 
 */
function checkIfServerlessMonitor(serverlessMonitorId: string) {
  return Object.keys(SERVERLESS_MONITORS).includes(serverlessMonitorId);
}

/**
 * 
 * @param serverlessMonitorId Unique ID string defined for each serverless monitor
 * @param existingMonitors Monitors that already been created 
 * @returns true if given monitor already exists
 */
function doesMonitorExist(serverlessMonitorId: string, existingMonitors: { [key: string]: number }) {
  return Object.keys(existingMonitors).includes(serverlessMonitorId);
}

/**
 * 
 * @param pluginMonitors Monitors that are currently defined in the plugin
 * @param existingMonitors Monitors that have already been created
 * @param monitorsApiKey API Key 
 * @param monitorsAppKey Application Key
 * @returns an array of successfully deleted monitors that were removed from the plugin
 */
async function deleteRemovedMonitors(pluginMonitors: Monitor[], existingMonitors: { [key: string]: number }, monitorsApiKey: string, monitorsAppKey: string) {
  const successfullyDeletedMonitors: string[] = [];
  const currentMonitorIds: string[] = [];
  pluginMonitors.forEach(currentMonitor => currentMonitorIds.push(Object.keys(currentMonitor)[0]));
  for (const pluginMonitorId of Object.keys(existingMonitors)) {
    if (!currentMonitorIds.includes(pluginMonitorId)) {
      const response = await deleteMonitor(existingMonitors[pluginMonitorId], pluginMonitorId, monitorsApiKey, monitorsAppKey);
      if (response) {
        successfullyDeletedMonitors.push(` ${pluginMonitorId}`);
      }
    }
  }
  return successfullyDeletedMonitors;
}

/**
 * 
 * @param monitors Monitors defined in the serverless.yml file
 * @param monitorsApiKey API Key
 * @param monitorsAppKey Application Key
 * @param cloudFormationStackId Cloud Formation Stack ID
 * @param service Service 
 * @param env Env 
 * @returns monitors that have been successfully created, updated, and deleted according to the configuration defined in the plugin
 */
export async function setMonitors(monitors: Monitor[], monitorsApiKey: string, monitorsAppKey: string, cloudFormationStackId: string, service: string, env: string) {
  const serverlessMonitorIdToMonitorId = await getExistingMonitors(cloudFormationStackId, monitorsApiKey, monitorsAppKey);
  const succesfullyUpdatedMonitors: string[] = [];
  const successfullyCreatedMonitors: string[] = [];

  for (const monitor of monitors) {
    const serverlessMonitorId = Object.keys(monitor)[0];
    const monitorIdNumber = serverlessMonitorIdToMonitorId[serverlessMonitorId];
    const monitorParams = buildMonitorParams(monitor, cloudFormationStackId, service, env);
    const monitorExists = await doesMonitorExist(serverlessMonitorId, serverlessMonitorIdToMonitorId);

    if (monitorExists) {
      const response = await updateMonitor(monitorIdNumber, serverlessMonitorId, monitorParams, monitorsApiKey, monitorsAppKey);
      if (response) {
        succesfullyUpdatedMonitors.push(` ${serverlessMonitorId}`);
      }
    }
    else {
      const response = await createMonitor(serverlessMonitorId, monitorParams, monitorsApiKey, monitorsAppKey);
      if (response) {
        successfullyCreatedMonitors.push(` ${serverlessMonitorId}`);
      }
    }
  }
  const successfullyDeletedMonitors = await deleteRemovedMonitors(monitors, serverlessMonitorIdToMonitorId, monitorsApiKey, monitorsAppKey);
  const logStatements: string[] = [];
  if (succesfullyUpdatedMonitors.length > 0) {
    logStatements.push(`Successfully updated${succesfullyUpdatedMonitors}`)
  }
  if (successfullyCreatedMonitors.length > 0) {
    logStatements.push(`Successfully created${successfullyCreatedMonitors}`)
  }
  if (successfullyDeletedMonitors.length > 0) {
    logStatements.push(`Successfully deleted${successfullyDeletedMonitors}`)
  }
  return logStatements;
}
