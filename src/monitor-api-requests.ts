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

// function checkResponse(responseStatus: number, monitorId?: string) {
//     if (responseStatus === 403) {
//         throw new InvalidAuthenticationError('Could not perform request due to invalid authentication');
//     }
//     else if (responseStatus === 400) {
//         throw new InvalidSyntaxError(`Could not perform request due to incorrect syntax for ${monitorId}`);
//     }
// }

export async function createMonitor(monitorParams: MonitorParams, serverlessMonitorId?: string, monitorsApiKey?: string, monitorsAppKey?: string) {
    // const serverlessMonitorId = Object.keys(monitor)[0];
    // const monitorParams = monitor[serverlessMonitorId];
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
    // try {
    //     checkResponse(request.status, serverlessMonitorId);
    // } catch (err) {
    //     if (err instanceof InvalidSyntaxError) {
    //         console.log(err);
    //     } else {
    //         throw err;
    //     }

    // }
    return false;
    // .catch((err: Error) => errors.push(err));


}

// export async function createMonitor(monitorsToCreate: Monitor, monitorsApiKey: string, monitorsAppKey: string) {
//     const successfullyCreated: string[] = [];
//     const request = (monitorId: string) => fetch("https://api.datadoghq.com/api/v1/monitor", {
//         method: "POST",
//         headers: {
//             "DD-API-KEY": monitorsApiKey,
//             "DD-APPLICATION-KEY": monitorsAppKey,
//             "Content-Type": "application/json",
//         },
//         body: JSON.stringify(monitorsToCreate[monitorId]),
//     })
//         .then((response: Response) => {
//             console.log(`createMonitor Response: ${response.status} ${response.statusText}`);
//             if (response.status === 200) {
//                 successfullyCreated.push(` ${monitorId}`);
//             }
//             else if (response.status === 403) {
//                 throw new InvalidAuthenticationError('Could not perform request due to invalid authentication');
//             }
//             else if (response.status === 400) {
//                 throw new InvalidSyntaxError(`Could not perform request due to incorrect syntax for ${monitorId}`);
//             }
//         })
//     // .catch((err: Error) => error.push(err));
//     const { error, data } = await batchRequest(Object.keys(monitorsToCreate), request, { batchSize: 500, delay: 10000 });
//     if (error.length > 0) {
//         console.log(error);
//     }
//     return successfullyCreated;
// }

// export async function updateMonitor(monitorId: number, monitorParams: { [key: string]: any }) {
//     fetch(`https://api.datadoghq.com/api/v1/monitor/${monitorId}`, {
//         method: "PUT",
//         headers: {
//             "DD-API-KEY": monitors_api_key,
//             "DD-APPLICATION-KEY": monitors_app_key,
//             "Content-Type": "application/json",
//         },
//         body: JSON.stringify(monitorParams),
//     })
//         .then((response: Response) => {
//             console.log(`updateMonitor ${monitorId} Response: ${response.status} ${response.statusText}`);
//             return response.text();
//         })
//     // .then((text: string) => console.log(`updated monitor: ${text}`))
//     // .catch((err: Error) => errors.push(err));
// }

// export async function updateMonitors(monitor: { [key: number]: Monitor }, monitorsApiKey: string, monitorsAppKey: string) {
//     const monitorId = parseInt(Object.keys(monitor)[0]);
//     const serverlessMonitorId = Object.keys(monitor[monitorId])[0];
//     const monitorParams = monitor[monitorId][serverlessMonitorId];
//     const succesfullyUpdated: string[] = [];
//     const request = await fetch(`https://api.datadoghq.com/api/v1/monitor/${monitorToUpdate}`, {
//         method: "PUT",
//         headers: {
//             "DD-API-KEY": monitorsApiKey,
//             "DD-APPLICATION-KEY": monitorsAppKey,
//             "Content-Type": "application/json",
//         },
//         body: JSON.stringify(monitorParams),
//     })
//     if (request.status === 200) {
//         succesfullyUpdated.push(serverlessMonitorId);
//     }
//     // .then((response: Response) => {
//     //     console.log(`updateMonitor Response: ${response.status} ${response.statusText}`);
//     //     if (response.status === 200) {
//     //         succesfullyUpdated.push(` ${serverlessMonitorId}`);
//     //     }
//     //     else if (response.status === 403) {
//     //         throw new InvalidAuthenticationError('403: Could not perform request due to invalid authentication');
//     //     }
//     //     else if (response.status === 400) {
//     //         throw new InvalidSyntaxError(`400: Could not perform request due to incorrect syntax for ${Object.entries(monitorsToUpdate[monitorToUpdate])[0][0]}`);
//     //     }
//     // })
//     // .catch((err: Error) => error.push(err));
//     // const { error, data } = await batchRequest(Object.keys(monitorsToUpdate), request, { batchSize: 500, delay: 10000 });
//     // if (error.length > 0) {
//     //     console.log(error);
//     // }
//     return succesfullyUpdated;
// }

// export async function updateMonitors(monitor: { [key: number]: Monitor }, monitorsApiKey: string, monitorsAppKey: string) {
// const monitorId = parseInt(Object.keys(monitor)[0]);
// const serverlessMonitorId = Object.keys(monitor[monitorId])[0];
// const monitorParams = monitor[monitorId][serverlessMonitorId];
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
    // try {
    //     checkResponse(request.status, serverlessMonitorId);
    // } catch (err) {
    //     if (err instanceof InvalidSyntaxError) {
    //         console.log(err);
    //     }
    //     throw err;
    // }
    return false;
}

// export async function deleteMonitor(monitor: { [key: string]: number }, monitorsApiKey: string, monitorsAppKey: string) {
export async function deleteMonitor(monitorId: number, serverlessMonitorId: string, monitorsApiKey: string, monitorsAppKey: string) {
    // const serverlessMonitorId = Object.keys(monitor)[0];
    // const monitorId = monitor[serverlessMonitorId];
    // const successfullyDeletedMonitors: string[] = [];
    const response = await fetch(`https://api.datadoghq.com/api/v1/monitor/${monitorId}`, {
        method: "DELETE",
        headers: {
            "DD-API-KEY": monitorsApiKey,
            "DD-APPLICATION-KEY": monitorsAppKey,
            "Content-Type": "application/json",
        },
    });
    console.log("delete" + response.status);
    // .then((response: Response) => {
    //     console.log(`deleteMonitors Response: ${response.status} ${response.statusText}`);
    //     return response.text();
    // })
    // .then((text: string) => console.log(text))
    if (response.status === 200) {
        return true;
    }
    else if (response.status === 403) {
        throw new InvalidAuthenticationError('Could not perform request due to invalid authentication');
    } else if (response.status === 400) {
        console.log(`Invalid Syntax Error: Could not perform request due to incorrect syntax for ${serverlessMonitorId}`)
    }
    // try {
    //     checkResponse(response.status, serverlessMonitorId);
    // } catch (err) {
    //     if (err instanceof InvalidSyntaxError) {
    //         console.log(err);
    //     }
    //     throw err;
    // }
    return false;
    // return successfullyDeletedMonitors;

    // .catch((err: Error) => errors.push(err));
}

// export async function deleteMonitor(monitorsToDelete: { [key: number]: string }, monitorsApiKey: string, monitorsAppKey: string) {
//     const successfullyDeleted: string[] = [];
//     const request = (monitorId: number) => fetch(`https://api.datadoghq.com/api/v1/monitor/${monitorId}`, {
//         method: "DELETE",
//         headers: {
//             // "DD-API-KEY": process.env.MONITORS_API_KEY,
//             // "DD-APPLICATION-KEY": process.env.MONITORS_APP_KEY,
//             "DD-API-KEY": monitorsApiKey,
//             "DD-APPLICATION-KEY": monitorsAppKey,
//             "Content-Type": "application/json",
//         },
//     })
//         .then((response: Response) => {
//             console.log(`deleteMonitors Response: ${response.status} ${response.statusText}`);
//             if (response.status === 200) {
//                 successfullyDeleted.push(` ${monitorsToDelete[monitorId]}`);
//             }
//             else if (response.status === 403) {
//                 throw new InvalidAuthenticationError('Could not perform request due to invalid authentication');
//             }
//         })
//     // .catch((err: Error) => error.push(err));

//     const { error, data } = await batchRequest(Object.keys(monitorsToDelete), request, { batchSize: 100, delay: 10000 })
//     if (error.length > 0) {
//         console.log(error);
//     }
//     return successfullyDeleted;
// }

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

    // console.log("search" + request.status);
    // try {
    //     checkResponse(request.status);
    // } catch (err) {
    //     if (err instanceof InvalidSyntaxError) {
    //         console.log(err);
    //     }
    //     throw err;
    // }
    // .then((response: Response) => {
    //     console.log(`searchMonitors Response: ${response.status} ${response.statusText}`);
    //     if (response.status === 403) {
    //         throw new InvalidAuthenticationError('Could not perform request due to invalid authentication');
    //     }
    //     return response.json();
    // })
    // .then((json: any) => {

    //     return json.monitors
    // })
    // .catch((err: Error) => console.log(err));
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