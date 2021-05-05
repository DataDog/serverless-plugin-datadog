// 1. create a bunch of example monitors 
// 2. predict the output for each monitor 
// 3. should I test out different combinations of monitors? 

import { createMonitor, deleteMonitor, getExistingMonitors, updateMonitor } from "./monitor-api-requests";
import { Monitor, setMonitors, buildMonitorParams } from "./monitors";

const customMonitor1: Monitor = {
    "custom_monitor_1": {
        "name": "Custom Monitor 1",
        "query": "max(next_1w):forecast(avg:system.load.1{*}, 'linear', 1, interval='60m', history='1w', model='default') >= 3",
    }
};
// 2. full custom monitor with threshold parameter defined in options
const customMonitor2: Monitor = {
    "custom_monitor_2": {
        "name": "Custom Monitor 2",
        "query": "avg(last_15m):anomalies(avg:system.load.1{*}, 'basic', 2, direction='both') >= 1",
        "tags": ["service:service", "env:env", "created_by:sls_dd_plugin"],
        "message": "This is a custom monitor",
        "options": {
            "renotify_interval": 0,
            "timeout_h": 0,
            "thresholds": { "critical": 1 },
            "notify_no_data": false,
            "no_data_timeframe": 2,
            "notify_audit": false,
            "require_full_window": true
        }
    }
}
// 2a. this is a repeat of custom monitor that updated custom monitor 2 
const updatedCustomMonitor2: Monitor = {
    "custom_monitor_2": {
        "name": "Custom Monitor 2",
        "query": "avg(last_15m):anomalies(avg:system.load.1{*}, 'basic', 2, direction='both') >= 1",
        "tags": ["service:service", "env:env", "created_by:sls_dd_plugin"],
        "message": "This is a custom monitor",
        "threshold": 0.2
    }
}
// 3. minimal serverless monitor
const serverlessMonitor1: Monitor = {
    "high_error_rate": {}
};
// 4. full custom monitor
const serverlessMonitor2: Monitor = {
    "increased_cost": {
        "name": "Increased Cost",
        "query": "",
        "message": "This is an increased cost monitor",
        "options": {
            "renotify_interval": 0,
            "timeout_h": 0,
            "thresholds": { "critical": 1 },
            "notify_no_data": false,
            "no_data_timeframe": 2,
            "notify_audit": false,
            "require_full_window": true
        }
    }
};
// 5. custom monitor that tries to overwrite query and name parameter
const serverlessMonitor3: Monitor = {
    "timeout": {
        "name": "Modified Timeout Monitor",
        "query": "avg(last_15m):anomalies(avg:system.load.1{*}, 'basic', 2, direction='both') >= 1"
    }
};
// 6. monitor that has invalid syntax because threshold conflicts with threshold defined in query param
const invalidMonitor: Monitor = {
    "invalid_monitor": {
        "name": "Invalid Monitor",
        "query": "avg(last_15m):anomalies(avg:system.load.1{*}, 'basic', 2, direction='both') >= 1",
        "message": "This is a custom monitor",
        "threshold": 0.2
    }
}
// 7. invalid monitor that doesn't have a body 
const invalidMonitor2: Monitor = {
    "invalid_monitor_2": {}
}

const monitors1 = [
    customMonitor1,
    customMonitor2,
    serverlessMonitor1,
    serverlessMonitor2,
    serverlessMonitor3,
];
const monitors2 = [
    customMonitor1,
    updatedCustomMonitor2,
    serverlessMonitor3,
];
const monitors3 = [
    customMonitor1,
    updatedCustomMonitor2,
    serverlessMonitor2,
    serverlessMonitor3
];
describe("buildMonitorParams", () => {
    it("returns valid monitor params", async () => {
        const monitorParams = buildMonitorParams(customMonitor1, "cloud_formation_id", "service", "env");
        // expect(monitorParams).toEqual(customMonitor1.custom_monitor_1)
        expect(monitorParams).toEqual(
            {
                name: 'Custom Monitor 1',
                query: "max(next_1w):forecast(avg:system.load.1{*}, 'linear', 1, interval='60m', history='1w', model='default') >= 3",
                tags: [
                    'serverless_monitor_type:single_function',
                    'serverless_monitor_id:custom_monitor_1',
                    'aws_cloudformation_stack-id:cloud_formation_id',
                    'created_by:dd_sls_plugin',
                    'env:env',
                    'service:service'
                ],
                options: {},
                type: 'metric alert'
            }
        );
    })
    it("returns valid monitor params", async () => {
        const monitorParams = buildMonitorParams(customMonitor2, "cloud_formation_id", "service", "env");
        expect(monitorParams).toEqual({
            name: 'Custom Monitor 2',
            query: "avg(last_15m):anomalies(avg:system.load.1{*}, 'basic', 2, direction='both') >= 1",
            tags: [
                'service:service',
                'env:env',
                'created_by:sls_dd_plugin',
                'serverless_monitor_type:single_function',
                'serverless_monitor_id:custom_monitor_2',
                'aws_cloudformation_stack-id:cloud_formation_id',
                'created_by:dd_sls_plugin',
                'env:env',
                'service:service'
            ],
            message: 'This is a custom monitor',
            options: {
                renotify_interval: 0,
                timeout_h: 0,
                thresholds: { critical: 1 },
                notify_no_data: false,
                no_data_timeframe: 2,
                notify_audit: false,
                require_full_window: true
            },
            type: 'metric alert'
        })
    })
    it("returns valid monitor params", async () => {
        const monitorParams = buildMonitorParams(updatedCustomMonitor2, "cloud_formation_id", "service", "env");
        expect(monitorParams).toEqual(
            {
                name: 'Custom Monitor 2',
                query: "avg(last_15m):anomalies(avg:system.load.1{*}, 'basic', 2, direction='both') >= 1",
                tags: [
                    'service:service',
                    'env:env',
                    'created_by:sls_dd_plugin',
                    'serverless_monitor_type:single_function',
                    'serverless_monitor_id:custom_monitor_2',
                    'aws_cloudformation_stack-id:cloud_formation_id',
                    'created_by:dd_sls_plugin',
                    'env:env',
                    'service:service'
                ],
                threshold: 0.2,
                message: 'This is a custom monitor',
                options: {},
                type: 'metric alert'
            })
    })
    it("returns valid monitor params", async () => {
        const monitorParams = buildMonitorParams(serverlessMonitor1, "cloud_formation_id", "service", "env");
        expect(monitorParams).toEqual({
            tags: [
                'serverless_monitor_type:single_function',
                'serverless_monitor_id:high_error_rate',
                'aws_cloudformation_stack-id:cloud_formation_id',
                'created_by:dd_sls_plugin',
                'env:env',
                'service:service'
            ],
            options: {},
            type: 'metric alert',
            query: 'avg(last_15m):sum:aws.lambda.errors{aws_cloudformation_stack-id:cloud_formation_id} by {functionname,region,aws_account}.as_count() / sum:aws.lambda.invocations{aws_cloudformation_stack-id:cloud_formation_id} by {functionname,region,aws_account}.as_count() >= 0.1',
            thresholds: 0.1,
            message: 'More than 10% of the function’s invocations were errors in the selected time range. {{#is_alert}} Resolution: Examine the function’s logs, check for recent code or configuration changes with [Deployment Tracking](https://docs.datadoghq.com/serverless/deployment_tracking), or look for failures across microservices with [distributed tracing](https://docs.datadoghq.com/serverless/distributed_tracing).{{/is_alert}}',
            name: 'High Error Rate on {{functionname.name}} in {{region.name}} for {{aws_account.name}}'
        });
    })
    // //     //syntax is invalid for some reason -- check 
    it("returns valid monitor params", async () => {
        const monitorParams = buildMonitorParams(serverlessMonitor2, "cloud_formation_id", "service", "env");
        expect(monitorParams).toEqual({
            name: 'Increased Cost',
            query: 'pct_change(avg(last_5m),last_5m):avg:aws.lambda.enhanced.estimated_cost{aws_cloudformation_stack-id:cloud_formation_id} > 20',
            message: 'This is an increased cost monitor',
            options: {
                renotify_interval: 0,
                timeout_h: 0,
                thresholds: { critical: 1 },
                notify_no_data: false,
                no_data_timeframe: 2,
                notify_audit: false,
                require_full_window: true
            },
            tags: [
                'serverless_monitor_type:single_function',
                'serverless_monitor_id:increased_cost',
                'aws_cloudformation_stack-id:cloud_formation_id',
                'created_by:dd_sls_plugin',
                'env:env',
                'service:service'
            ],
            type: 'metric alert',
            thresholds: 0.2
        })
    })
    it("returns valid monitor params", async () => {
        const monitorParams = buildMonitorParams(serverlessMonitor3, "cloud_formation_id", "service", "env");
        expect(monitorParams).toEqual(
            {
                name: 'Modified Timeout Monitor',
                query: 'avg(last_15m):sum:aws.lambda.duration.maximum{aws_cloudformation_stack-id:cloud_formation_id} by {aws_account,functionname,region}.as_count() / (sum:aws.lambda.timeout{aws_cloudformation_stack-id:cloud_formation_id} by {aws_account,functionname,region}.as_count() * 1000) >= 1',
                tags: [
                    'serverless_monitor_type:single_function',
                    'serverless_monitor_id:timeout',
                    'aws_cloudformation_stack-id:cloud_formation_id',
                    'created_by:dd_sls_plugin',
                    'env:env',
                    'service:service'
                ],
                options: {},
                type: 'metric alert',
                thresholds: 1,
                message: 'At least one invocation in the selected time range timed out. This occurs when your function runs for longer than the configured timeout or the global Lambda timeout. Resolution: [Distributed tracing](https://docs.datadoghq.com/serverless/distributed_tracing) can help you pinpoint slow requests to APIs and other microservices. You can also consider increasing the timeout of your function. Note that this could affect your AWS bill.'
            }
        )
    })
    it("returns invalid monitor params", async () => {
        const monitorParams = buildMonitorParams(invalidMonitor, "cloud_formation_id", "service", "env");
        expect(monitorParams).toEqual({
            name: 'Invalid Monitor',
            query: "avg(last_15m):anomalies(avg:system.load.1{*}, 'basic', 2, direction='both') >= 1",
            tags: [
                'serverless_monitor_type:single_function',
                'serverless_monitor_id:invalid_monitor',
                'aws_cloudformation_stack-id:cloud_formation_id',
                'created_by:dd_sls_plugin',
                'env:env',
                'service:service'
            ],
            message: 'This is a custom monitor',
            threshold: 0.2,
            options: {},
            type: 'metric alert'
        });
    })
    it("returns invalid monitor params", async () => {
        const monitorParams = buildMonitorParams(invalidMonitor2, "cloud_formation_id", "service", "env");
        expect(monitorParams).toEqual(
            {
                tags: [
                    'serverless_monitor_type:single_function',
                    'serverless_monitor_id:invalid_monitor_2',
                    'aws_cloudformation_stack-id:cloud_formation_id',
                    'created_by:dd_sls_plugin',
                    'env:env',
                    'service:service'
                ],
                options: {},
                type: 'metric alert'
            })
    })



})
jest.mock('./monitor-api-requests', () => ({
    createMonitor: jest.fn(),
    updateMonitor: jest.fn(),
    deleteMonitor: jest.fn(),
    getExistingMonitors: jest.fn()
}));

describe("setMonitors", () => {
    afterEach(() => {
        (createMonitor as unknown as jest.Mock).mockClear();
        (updateMonitor as unknown as jest.Mock).mockClear();
        (deleteMonitor as unknown as jest.Mock).mockClear();
        (getExistingMonitors as unknown as jest.Mock).mockClear();
    })
    it("returns an array of updated monitors, an array of created monitors, an array of deleted monitors", async () => {
        (getExistingMonitors as unknown as jest.Mock).mockReturnValue({});
        (createMonitor as unknown as jest.Mock).mockReturnValue({ status: 200 });
        const logStatements = await setMonitors([customMonitor1], "apikey", "appkey", "stack_id", "service", "env")
        expect(logStatements).toEqual(["Succesfully created custom_monitor_1"]);
        expect(createMonitor as unknown as jest.Mock).toHaveBeenCalledWith({ "name": "Custom Monitor 1", "options": {}, "query": "max(next_1w):forecast(avg:system.load.1{*}, 'linear', 1, interval='60m', history='1w', model='default') >= 3", "tags": ["serverless_monitor_type:single_function", "serverless_monitor_id:custom_monitor_1", "aws_cloudformation_stack-id:stack_id", "created_by:dd_sls_plugin", "env:env", "service:service"], "type": "metric alert" }, "custom_monitor_1", "apikey", "appkey");
    })
    it("returns an array of updated monitors, an array of created monitors, an array of deleted monitors", async () => {
        (getExistingMonitors as unknown as jest.Mock).mockReturnValue({});
        (createMonitor as unknown as jest.Mock).mockReturnValue({ status: 200 });
        (updateMonitor as unknown as jest.Mock).mockReturnValue({ status: 200 });
        const logStatements = await setMonitors(monitors1, "apikey", "appkey", "stack_id", "service", "env")
        expect(logStatements).toEqual(["Succesfully created custom_monitor_1"],);
        expect(createMonitor as unknown as jest.Mock).toHaveBeenCalledWith({ "name": "Custom Monitor 1", "options": {}, "query": "max(next_1w):forecast(avg:system.load.1{*}, 'linear', 1, interval='60m', history='1w', model='default') >= 3", "tags": ["serverless_monitor_type:single_function", "serverless_monitor_id:custom_monitor_1", "aws_cloudformation_stack-id:stack_id", "created_by:dd_sls_plugin", "env:env", "service:service"], "type": "metric alert" }, "custom_monitor_1", "apikey", "appkey");
        expect(updateMonitor as unknown as jest.Mock).toHaveBeenCalledWith({ "name": "Custom Monitor 1", "options": {}, "query": "max(next_1w):forecast(avg:system.load.1{*}, 'linear', 1, interval='60m', history='1w', model='default') >= 3", "tags": ["serverless_monitor_type:single_function", "serverless_monitor_id:custom_monitor_1", "aws_cloudformation_stack-id:stack_id", "created_by:dd_sls_plugin", "env:env", "service:service"], "type": "metric alert" }, "custom_monitor_1", "apikey", "appkey");

    })
    it("returns an array of updated monitors, an array of created monitors, an array of deleted monitors", async () => {
        (getExistingMonitors as unknown as jest.Mock).mockReturnValue({});
        (createMonitor as unknown as jest.Mock).mockReturnValue({ status: 200 });
        (updateMonitor as unknown as jest.Mock).mockReturnValue({ status: 200 });
        (deleteMonitor as unknown as jest.Mock).mockReturnValue({ status: 200 });
        const logStatements = await setMonitors(monitors2, "apikey", "appkey", "stack_id", "service", "env")
        expect(logStatements).toEqual(["Succesfully created custom_monitor_1"]);
        expect(createMonitor as unknown as jest.Mock).toHaveBeenCalledWith({ "name": "Custom Monitor 1", "options": {}, "query": "max(next_1w):forecast(avg:system.load.1{*}, 'linear', 1, interval='60m', history='1w', model='default') >= 3", "tags": ["serverless_monitor_type:single_function", "serverless_monitor_id:custom_monitor_1", "aws_cloudformation_stack-id:stack_id", "created_by:dd_sls_plugin", "env:env", "service:service"], "type": "metric alert" }, "custom_monitor_1", "apikey", "appkey");
        expect(updateMonitor as unknown as jest.Mock).toHaveBeenCalledWith({ "name": "Custom Monitor 1", "options": {}, "query": "max(next_1w):forecast(avg:system.load.1{*}, 'linear', 1, interval='60m', history='1w', model='default') >= 3", "tags": ["serverless_monitor_type:single_function", "serverless_monitor_id:custom_monitor_1", "aws_cloudformation_stack-id:stack_id", "created_by:dd_sls_plugin", "env:env", "service:service"], "type": "metric alert" }, "custom_monitor_1", "apikey", "appkey");
        // expect(deleteMonitor as unknown as jest.Mock).toHaveBeenCalledWith({ "name": "Custom Monitor 1", "options": {}, "query": "max(next_1w):forecast(avg:system.load.1{*}, 'linear', 1, interval='60m', history='1w', model='default') >= 3", "tags": ["serverless_monitor_type:single_function", "serverless_monitor_id:custom_monitor_1", "aws_cloudformation_stack-id:stack_id", "created_by:dd_sls_plugin", "env:env", "service:service"], "type": "metric alert" }, "custom_monitor_1", "apikey", "appkey");

    })
    it("returns an array of updated monitors, an array of created monitors, an array of deleted monitors", async () => {
        (getExistingMonitors as unknown as jest.Mock).mockReturnValue({});
        (createMonitor as unknown as jest.Mock).mockReturnValue({ status: 200 });
        (updateMonitor as unknown as jest.Mock).mockReturnValue({ status: 200 });
        (deleteMonitor as unknown as jest.Mock).mockReturnValue({ status: 200 });
        const logStatements = await setMonitors(monitors3, "apikey", "appkey", "stack_id", "service", "env")
        expect(logStatements).toEqual(["Succesfully created custom_monitor_1"]);
        expect(createMonitor as unknown as jest.Mock).toHaveBeenCalledWith({ "name": "Custom Monitor 1", "options": {}, "query": "max(next_1w):forecast(avg:system.load.1{*}, 'linear', 1, interval='60m', history='1w', model='default') >= 3", "tags": ["serverless_monitor_type:single_function", "serverless_monitor_id:custom_monitor_1", "aws_cloudformation_stack-id:stack_id", "created_by:dd_sls_plugin", "env:env", "service:service"], "type": "metric alert" }, "custom_monitor_1", "apikey", "appkey");
        expect(updateMonitor as unknown as jest.Mock).toHaveBeenCalledWith({ "name": "Custom Monitor 1", "options": {}, "query": "max(next_1w):forecast(avg:system.load.1{*}, 'linear', 1, interval='60m', history='1w', model='default') >= 3", "tags": ["serverless_monitor_type:single_function", "serverless_monitor_id:custom_monitor_1", "aws_cloudformation_stack-id:stack_id", "created_by:dd_sls_plugin", "env:env", "service:service"], "type": "metric alert" }, "custom_monitor_1", "apikey", "appkey");
        // expect(createMonitor as unknown as jest.Mock).toHaveBeenCalledWith({ "name": "Custom Monitor 1", "options": {}, "query": "max(next_1w):forecast(avg:system.load.1{*}, 'linear', 1, interval='60m', history='1w', model='default') >= 3", "tags": ["serverless_monitor_type:single_function", "serverless_monitor_id:custom_monitor_1", "aws_cloudformation_stack-id:stack_id", "created_by:dd_sls_plugin", "env:env", "service:service"], "type": "metric alert" }, "custom_monitor_1", "apikey", "appkey");

    })
})