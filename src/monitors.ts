import { SERVERLESS_MONITORS } from "./serverless_monitors"
import { updateMonitor, searchMonitors, createMonitor, deleteMonitor, getExistingMonitors } from "./monitor-api-requests";
import { create } from "mock-fs/lib/filesystem";
const fetch = require("node-fetch");

export const errors: Error[] = [];

export interface MonitorParams {
  [key: string]: any;
}
export interface Monitor {
  [key: string]: MonitorParams;
}

// Adds appropriate tags and default parameter values
export function buildMonitorParams(monitor: Monitor, cloudFormationStackId: string, service: string, env: string) {
  const serverlessMonitorId = Object.keys(monitor)[0]; // is there a better way to get the id? 

  if (!monitor[serverlessMonitorId]) {
    monitor[serverlessMonitorId] = {};
  }

  const monitorParams = monitor[serverlessMonitorId];

  if (!monitorParams.tags) {
    monitorParams.tags = [];
  }
  if (!monitorParams.options) {
    monitorParams.options = {}
  }
  if (monitorParams.type === undefined) {
    monitorParams.type = "metric alert";
  }
  if (typeof monitorParams.thresholds === "string") {
    monitorParams.thresholds = { critical: `${monitorParams.threshold}` };
  }

  monitorParams.tags.push("serverless_monitor_type:single_function");
  monitorParams.tags.push(`serverless_monitor_id:${serverlessMonitorId}`);
  monitorParams.tags.push(`aws_cloudformation_stack-id:${cloudFormationStackId}`);
  monitorParams.tags.push("created_by:dd_sls_plugin");
  monitorParams.tags.push(`env:${env}`);
  monitorParams.tags.push(`service:${service}`);

  if (checkIfServerlessMonitor(serverlessMonitorId)) {
    monitorParams.query = SERVERLESS_MONITORS[serverlessMonitorId].query(cloudFormationStackId);
    if (!monitorParams.thresholds) {
      monitorParams.thresholds = SERVERLESS_MONITORS[serverlessMonitorId].threshold;
    }
    if (!monitorParams.message) {
      monitorParams.message = SERVERLESS_MONITORS[serverlessMonitorId].message;
    }
    if (!monitorParams.name) {
      monitorParams.name = SERVERLESS_MONITORS[serverlessMonitorId].name;
    }
    if (monitorParams.threshold) { // not sure if this is still needed
      const threshold = typeof monitorParams.threshold === "number" ? monitorParams.threshold
        : monitorParams.threshold.critical ? monitorParams.threshold.critical
          : monitorParams.threshold;

      const thresholdIndex = monitorParams.query.lastIndexOf("=") ? monitorParams.query.lastIndexOf("=") + 1
        : monitorParams.query.lastIndexOf("<") ? monitorParams.query.lastIndexOf("<") + 1
          : monitorParams.query.lastIndexOf(">") ? monitorParams.query.lastIndeOf(">") + 1
            : monitorParams.query.length;
      monitorParams.query = monitorParams.query.substr(0, thresholdIndex + 1) + `${threshold}`;
    }
  }
  return monitorParams;
}

// Checks to see if a given monitor object is a serverless recommended monitor
function checkIfServerlessMonitor(serverlessMonitorId: string) {
  return Object.keys(SERVERLESS_MONITORS).includes(serverlessMonitorId);
}

// Checks to see if a monitor defined in the plugin has already been created
function doesMonitorExist(serverlessMonitorId: string, pluginMonitors: { [key: string]: number }) {
  return Object.keys(pluginMonitors).includes(serverlessMonitorId);
}

// Deletes monitors that are no longer included in the serverless.yml file 
async function deleteRemovedMonitors(currentMonitors: Monitor[], pluginMonitorIds: { [key: string]: number }, monitorsApiKey: string, monitorsAppKey: string) {
  const successfullyDeletedMonitors: string[] = [];
  const currentMonitorIds: string[] = [];
  const monitorsToRemove: { [key: number]: string } = {};
  currentMonitors.forEach(currentMonitor => currentMonitorIds.push(Object.keys(currentMonitor)[0]));
  for (const pluginMonitorId of Object.keys(pluginMonitorIds)) {
    if (!currentMonitorIds.includes(pluginMonitorId)) {
      const response = await deleteMonitor(pluginMonitorIds[pluginMonitorId], pluginMonitorId, monitorsApiKey, monitorsAppKey);
      if (response) {
        successfullyDeletedMonitors.push(` ${pluginMonitorId}`);
      }
    }
  }
  return successfullyDeletedMonitors;
}

// Updates, deletes, and creates the appropriate monitors according to the configuration defined in the serverless.yml file
export async function setMonitors(monitors: Monitor[], monitorsApiKey: string, monitorsAppKey: string, cloudFormationStackId: string, service: string, env: string) {
  const monitorIdsMap = await getExistingMonitors(cloudFormationStackId, monitorsApiKey, monitorsAppKey);
  const succesfullyUpdatedMonitors: string[] = [];
  const successfullyCreatedMonitors: string[] = [];

  for (const monitor of monitors) {
    const serverlessMonitorId = Object.keys(monitor)[0];
    const monitorIdNumber = monitorIdsMap[serverlessMonitorId];
    const monitorParams = buildMonitorParams(monitor, cloudFormationStackId, service, env);
    const monitorExists = await doesMonitorExist(serverlessMonitorId, monitorIdsMap);

    if (monitorExists) {
      const response = await updateMonitor(monitorIdNumber, serverlessMonitorId, monitorParams, monitorsApiKey, monitorsAppKey);
      if (response) {
        succesfullyUpdatedMonitors.push(` ${serverlessMonitorId}`);
      }
    }
    else {
      const response = await createMonitor(monitorParams, serverlessMonitorId, monitorsApiKey, monitorsAppKey);
      if (response) {
        successfullyCreatedMonitors.push(` ${serverlessMonitorId}`);
      }
    }
  }
  const successfullyDeletedMonitors = await deleteRemovedMonitors(monitors, monitorIdsMap, monitorsApiKey, monitorsAppKey);
  const logStatements: string[] = [];
  if (succesfullyUpdatedMonitors.length > 0) {
    logStatements.push(`Succesfully updated${succesfullyUpdatedMonitors}`)
  }
  if (successfullyCreatedMonitors.length > 0) {
    logStatements.push(`Succesfully created${successfullyCreatedMonitors}`)
  }
  if (successfullyDeletedMonitors.length > 0) {
    logStatements.push(`Succesfully deleted${successfullyDeletedMonitors}`)
  }
  return logStatements;
}
