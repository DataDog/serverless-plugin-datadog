const fetch = require("node-fetch");
import { Response } from "node-fetch";
import * as Serverless from "serverless";

export async function createMonitor(monitorParams: { [key: string]: any }) {
    fetch("https://api.datadoghq.com/api/v1/monitor", {
        method: "POST",
        headers: {
            "DD-API-KEY": "",
            "DD-APPLICATION-KEY": "",
            "Content-Type": "application/json",
        },
        body: JSON.stringify(monitorParams),
    })
        .then((response: Response) => {
            console.log(`createMonitor Response: ${response.status} ${response.statusText}`);
        })
    // .catch((err: Error) => errors.push(err));
}

export async function updateMonitor(monitorId: number, monitorParams: { [key: string]: any }) {
    fetch(`https://api.datadoghq.com/api/v1/monitor/${monitorId}`, {
        method: "PUT",
        headers: {
            "DD-API-KEY": "",
            "DD-APPLICATION-KEY": "",
            "Content-Type": "application/json",
        },
        body: JSON.stringify(monitorParams),
    })
        .then((response: Response) => {
            console.log(`updateMonitor ${monitorId} Response: ${response.status} ${response.statusText}`);
            return response.text();
        })
    // .then((text: string) => console.log(`updated monitor: ${text}`))
    // .catch((err: Error) => errors.push(err));
}

export function deleteMonitor(monitorId: number) {
    fetch(`https://api.datadoghq.com/api/v1/monitor/${monitorId}`, {
        method: "DELETE",
        headers: {
            "DD-API-KEY": "",
            "DD-APPLICATION-KEY": "",
            "Content-Type": "application/json",
        },
    })
        .then((response: Response) => {
            console.log(`deleteMonitors Response: ${response.status} ${response.statusText}`);
            return response.text();
        })
        .then((text: string) => console.log(text))
    // .catch((err: Error) => errors.push(err));
}

export async function searchMonitors(queryTag: string) {
    const query = `tag:"${queryTag}"`;
    const fetchedMonitors = fetch(`https://api.datadoghq.com/api/v1/monitor/search?query=${query}`, {
        method: "GET",
        headers: {
            "DD-API-KEY": "",
            "DD-APPLICATION-KEY": "",
            "Content-Type": "application/json",
        },
    })
        .then((response: Response) => {
            console.log(`searchMonitors Response: ${response.status} ${response.statusText}`);
            // return response.text();
            return response.json();
        })
        // .then((json) => console.log(json.monitors));
        .then((json: any) => {
            return json.monitors
        });
    // .catch((err) => console.log(err))

    return fetchedMonitors;
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
    const cloudFormationStackId: string = describeStackOutput ? describeStackOutput.Stacks[0].StackId : "Unable to retrieve CloudFormation Stack ID";
    return [describeStackOutput, cloudFormationStackId];
}