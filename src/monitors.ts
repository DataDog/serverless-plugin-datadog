import { SERVERLESS_MONITORS } from "./serverless_monitors";
import { updateMonitor, createMonitor, deleteMonitor, getExistingMonitors } from "./monitor-api-requests";

export interface MonitorParams {
  [key: string]: any;
}
export interface Monitor {
  [key: string]: MonitorParams;
}

/**
 * Adds the appropriate tags and required parameters that will be passed as part of the request body for creating and updating monitors
 * @param monitor - the Monitor object that is defined in the serverless.yml file
 * @param cloudFormationStackId - the Cloud Formation Stack ID
 * @param service - the Service
 * @param env  - the Environment
 * @returns valid monitor parameters
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

  if (checkIfRecommendedMonitor(serverlessMonitorId)) {
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
 * Checks to see if the given monitor is a serverless recommended monitor
 * @param serverlessMonitorId - Unique ID string defined for each serverless monitor
 * @returns true if a given monitor is a serverless recommended monitor
 */
function checkIfRecommendedMonitor(serverlessMonitorId: string) {
  return Object.keys(SERVERLESS_MONITORS).includes(serverlessMonitorId);
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
      const response = await deleteMonitor(
        existingMonitors[pluginMonitorId],
        pluginMonitorId,
        monitorsApiKey,
        monitorsAppKey,
      );
      if (response) {
        successfullyDeletedMonitors.push(` ${pluginMonitorId}`);
      }
    }
  }
  return successfullyDeletedMonitors;
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
  monitors: Monitor[],
  monitorsApiKey: string,
  monitorsAppKey: string,
  cloudFormationStackId: string,
  service: string,
  env: string,
) {
  const serverlessMonitorIdByMonitorId = await getExistingMonitors(
    cloudFormationStackId,
    monitorsApiKey,
    monitorsAppKey,
  );
  const successfullyUpdatedMonitors: string[] = [];
  const successfullyCreatedMonitors: string[] = [];

  for (const monitor of monitors) {
    const serverlessMonitorId = Object.keys(monitor)[0];
    const monitorIdNumber = serverlessMonitorIdByMonitorId[serverlessMonitorId];
    const monitorParams = buildMonitorParams(monitor, cloudFormationStackId, service, env);
    const monitorExists = await doesMonitorExist(serverlessMonitorId, serverlessMonitorIdByMonitorId);

    if (monitorExists) {
      const response = await updateMonitor(
        monitorIdNumber,
        serverlessMonitorId,
        monitorParams,
        monitorsApiKey,
        monitorsAppKey,
      );
      if (response) {
        successfullyUpdatedMonitors.push(` ${serverlessMonitorId}`);
      }
    } else {
      const response = await createMonitor(serverlessMonitorId, monitorParams, monitorsApiKey, monitorsAppKey);
      if (response) {
        successfullyCreatedMonitors.push(` ${serverlessMonitorId}`);
      }
    }
  }
  const successfullyDeletedMonitors = await deleteRemovedMonitors(
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
