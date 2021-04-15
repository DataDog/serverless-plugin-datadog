// import { create } from "mock-fs/lib/filesystem";
import { Response } from "node-fetch";
import { SERVERLESS_MONITORS } from "./serverless_monitors"
import * as Serverless from "serverless";
import { updateMonitor, searchMonitors, createMonitor, deleteMonitor } from "./monitor_api_requests";

const fetch = require("node-fetch");

export const errors: Error[] = [];

export interface Monitor {
  [key: string]: {
    [key: string]: any;
  };
}

// Adds appropriate tags and default parameter values
function cleanData(monitor: Monitor, cloudFormationStackId: string) {
  const monitorId = Object.keys(monitor)[0];
  if (!monitor[monitorId]) {
    monitor[monitorId] = {};
  }
  const monitorParams = monitor[monitorId];

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

  monitorParams.tags.push("serverless:single_function");
  monitorParams.tags.push(`serverless_id:${monitorId}`);
  monitorParams.tags.push(`aws_cloudformation_stack-id:${cloudFormationStackId}`);

  if (checkIfServerlessMonitor(monitorId)) {
    monitorParams.tags.push("serverless_monitor");
    monitorParams.query = SERVERLESS_MONITORS[monitorId].query;
    if (!monitorParams.thresholds) {
      monitorParams.thresholds = SERVERLESS_MONITORS[monitorId].threshold;
    }
    if (!monitorParams.message) {
      monitorParams.message = SERVERLESS_MONITORS[monitorId].message;
    }
    if (!monitorParams.name) {
      monitorParams.name = SERVERLESS_MONITORS[monitorId].name;
    }
    if (monitorParams.threshold) {
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
function checkIfServerlessMonitor(monitorIdString: string) {
  return Object.keys(SERVERLESS_MONITORS).includes(monitorIdString);
}

// Checks to see if a monitor defined in the plugin has already been created
function doesMonitorExist(monitorId: string, pluginMonitors: { [key: string]: number }) {
  return Object.keys(pluginMonitors).includes(monitorId);
}

// Deletes monitors that are no longer included in the serverless.yml file 
function deleteRemovedMonitors(monitors: Monitor[], pluginMonitorIds: { [key: string]: number }) {
  const monitorIds: string[] = [];
  monitors.forEach(monitor => monitorIds.push(Object.keys(monitor)[0]));
  for (const pluginMonitorId of Object.keys(pluginMonitorIds)) {
    if (!monitorIds.includes(pluginMonitorId)) {
      deleteMonitor(pluginMonitorIds[pluginMonitorId]);
    }
  }
}

async function getExistingMonitors(cloudFormationStackId: string) {
  const pluginDefinedMonitors = await searchMonitors(`aws_cloudformation_stack-id:${cloudFormationStackId}`);
  const pluginMonitorIdsMap: { [key: string]: number } = {};
  for (const pluginDefinedMonitor of pluginDefinedMonitors) {
    for (const pluginMonitorTag of pluginDefinedMonitor.tags) {
      if (pluginMonitorTag.startsWith('serverless_id:')) {
        const pluginMonitorIdString = pluginMonitorTag.substring(pluginMonitorTag.indexOf(':') + 1);
        pluginMonitorIdsMap[pluginMonitorIdString] = pluginDefinedMonitor.id;
      }
    }
  }
  return pluginMonitorIdsMap;
}

// Updates, deletes, and creates the appropriate monitors according to the configuration defined in the serverless.yml file
export async function setMonitors(monitors: Monitor[], cloudFormationStackId: string) {
  const pluginMonitorIdsMap = await getExistingMonitors(cloudFormationStackId);
  console.log(pluginMonitorIdsMap);
  for (const monitor of monitors) {
    const monitorIdString = Object.keys(monitor)[0];
    const cleanMonitorParams = cleanData(monitor, cloudFormationStackId);
    const monitorExists = await doesMonitorExist(monitorIdString, pluginMonitorIdsMap);
    if (monitorExists) {
      await updateMonitor(pluginMonitorIdsMap[monitorIdString], cleanMonitorParams)
    }
    else {
      await createMonitor(cleanMonitorParams);
    }
  }
  await deleteRemovedMonitors(monitors, pluginMonitorIdsMap);
  return errors;
}