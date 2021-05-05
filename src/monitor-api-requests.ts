const fetch = require("node-fetch");
const batchRequest = require('batch-request-js');
import { Server } from "http";
import { Monitor, MonitorParams } from "monitors";
import { Response } from "node-fetch";
import * as Serverless from "serverless";

export class InvalidAuthenticationError extends Error {
    constructor(message: string) {
        super(...message);
        this.name = "Invalid Authentication Error";
        this.message = message;
    }
}

class InvalidSyntaxError extends Error {
    constructor(message: string) {
        super(...message);
        this.name = "Invalid Syntax Error";
        this.message = message;
    }
}

export async function createMonitor(monitorParams: MonitorParams, serverlessMonitorId?: string, monitorsApiKey?: string, monitorsAppKey?: string) {
    const request = await fetch("https://api.datadoghq.com/api/v1/monitor", {
        method: "POST",
        headers: {
            "DD-API-KEY": monitorsApiKey,
            "DD-APPLICATION-KEY": monitorsAppKey,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(monitorParams),
    });

    console.log("create" + request.status);
    console.log(request);
    if (request.status === 200) {
        return true;
    } else if (request.status === 403) {
        throw new InvalidAuthenticationError('Could not perform request due to invalid authentication');
    } else if (request.status === 400) {
        console.log(`Invalid Syntax Error: Could not perform request due to incorrect syntax for ${serverlessMonitorId}`)
    }

    return false;
}

export async function updateMonitor(monitorId: number, serverlessMonitorId: string, monitorParams: MonitorParams, monitorsApiKey: string, monitorsAppKey: string) {
    const request = await fetch(`https://api.datadoghq.com/api/v1/monitor/${monitorId}`, {
        method: "PUT",
        headers: {
            "DD-API-KEY": monitorsApiKey,
            "DD-APPLICATION-KEY": monitorsAppKey,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(monitorParams),
    })

    console.log("update" + request.status);
    if (request.status === 200) {
        return true;
    }
    else if (request.status === 403) {
        throw new InvalidAuthenticationError('Could not perform request due to invalid authentication');
    } else if (request.status === 400) {
        console.log(`Invalid Syntax Error: Could not perform request due to incorrect syntax for ${serverlessMonitorId}`)
    }

    return false;
}

export async function deleteMonitor(monitorId: number, serverlessMonitorId: string, monitorsApiKey: string, monitorsAppKey: string) {
    const response = await fetch(`https://api.datadoghq.com/api/v1/monitor/${monitorId}`, {
        method: "DELETE",
        headers: {
            "DD-API-KEY": monitorsApiKey,
            "DD-APPLICATION-KEY": monitorsAppKey,
            "Content-Type": "application/json",
        },
    });
    console.log("delete" + response.status);
    if (response.status === 200) {
        return true;
    }
    else if (response.status === 403) {
        throw new InvalidAuthenticationError('Could not perform request due to invalid authentication');
    } else if (response.status === 400) {
        console.log(`Invalid Syntax Error: Could not perform request due to incorrect syntax for ${serverlessMonitorId}`)
    }
    return false;

}

export async function searchMonitors(queryTag: string, monitorsApiKey: string, monitorsAppKey: string) {
    const query = `tag:"${queryTag}"`;
    const request: Response = await fetch(`https://api.datadoghq.com/api/v1/monitor/search?query=${query}`, {
        method: "GET",
        headers: {
            "DD-API-KEY": monitorsApiKey,
            "DD-APPLICATION-KEY": monitorsAppKey,
            "Content-Type": "application/json",
        },
    });
    if (request.status === 403) {
        throw new InvalidAuthenticationError('Could not perform request due to invalid authentication');
    }

    console.log(request);
    const json: any = await request.json();
    console.log(json);
    const monitors = json.monitors;
    console.log(monitors);
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

export async function getExistingMonitors(cloudFormationStackId: string, monitorsApiKey: string, monitorsAppKey: string) {
    const existingMonitors = await searchMonitors(`aws_cloudformation_stack-id:${cloudFormationStackId}`, monitorsApiKey, monitorsAppKey);
    const monitorIdsMap: { [key: string]: number } = {};
    for (const existingMonitor of existingMonitors) {
        for (const tag of existingMonitor.tags) {
            if (tag.startsWith('serverless_monitor_id:')) {
                const serverlessMonitorId = tag.substring(tag.indexOf(':') + 1);
                monitorIdsMap[serverlessMonitorId] = existingMonitor.id;
            }
        }
    }
    return monitorIdsMap;
}