import fetch from "node-fetch";
import { createMonitor, updateMonitor, deleteMonitor, searchMonitors, InvalidAuthenticationError } from "./monitor-api-requests"
import { MonitorParams } from "./monitors";

jest.mock('node-fetch');

const monitorParams: MonitorParams = {
    tags: [
        'serverless_monitor_type:single_function',
        'serverless_monitor_id:high_error_rate',
        'aws_cloudformation_stack-id:cloudformation_stack_id',
        'created_by:dd_sls_plugin',
        'env:dev',
        'service:plugin-demo-ts'
    ],
    options: {},
    type: 'metric alert',
    query: 'avg(last_15m):sum:aws.lambda.errors{aws_cloudformation_stack-id:cloudformation_stack_id} by {functionname,region,aws_account}.as_count() / sum:aws.lambda.invocations{aws_cloudformation_stack-id:cloudformation_stack_id} by {functionname,region,aws_account}.as_count() >= 0.1',
    thresholds: 0.1,
    message: 'More than 10% of the function’s invocations were errors in the selected time range. {{#is_alert}} Resolution: Examine the function’s logs, check for recent code or configuration changes with [Deployment Tracking](https://docs.datadoghq.com/serverless/deployment_tracking), or look for failures across microservices with [distributed tracing](https://docs.datadoghq.com/serverless/distributed_tracing).{{/is_alert}}',
    name: 'High Error Rate on {{functionname.name}} in {{region.name}} for {{aws_account.name}}'
}

const invalidMonitorParams: MonitorParams = {
    tags: [
        'serverless_monitor_type:single_function',
        'serverless_monitor_id:high_error_rate',
        'aws_cloudformation_stack-id:cloudformation_stack_id',
        'created_by:dd_sls_plugin',
        'env:dev',
        'service:plugin-demo-ts'
    ],
    type: 'metric alert',
    query: 'avg(last_15m):sum:aws.lambda.errors{aws_cloudformation_stack-id:cloudformation_stack_id} by {functionname,region,aws_account}.as_count() / sum:aws.lambda.invocations{aws_cloudformation_stack-id:cloudformation_stack_id} by {functionname,region,aws_account}.as_count() >= 0.1',
    thresholds: 0.1,
    message: 'More than 10% of the function’s invocations were errors in the selected time range. {{#is_alert}} Resolution: Examine the function’s logs, check for recent code or configuration changes with [Deployment Tracking](https://docs.datadoghq.com/serverless/deployment_tracking), or look for failures across microservices with [distributed tracing](https://docs.datadoghq.com/serverless/distributed_tracing).{{/is_alert}}',
    name: 'High Error Rate on {{functionname.name}} in {{region.name}} for {{aws_account.name}}'
}

describe("createMonitor", () => {
    const validRequestBody = { "body": "{\"tags\":[\"serverless_monitor_type:single_function\",\"serverless_monitor_id:high_error_rate\",\"aws_cloudformation_stack-id:cloudformation_stack_id\",\"created_by:dd_sls_plugin\",\"env:dev\",\"service:plugin-demo-ts\"],\"options\":{},\"type\":\"metric alert\",\"query\":\"avg(last_15m):sum:aws.lambda.errors{aws_cloudformation_stack-id:cloudformation_stack_id} by {functionname,region,aws_account}.as_count() / sum:aws.lambda.invocations{aws_cloudformation_stack-id:cloudformation_stack_id} by {functionname,region,aws_account}.as_count() >= 0.1\",\"thresholds\":0.1,\"message\":\"More than 10% of the function’s invocations were errors in the selected time range. {{#is_alert}} Resolution: Examine the function’s logs, check for recent code or configuration changes with [Deployment Tracking](https://docs.datadoghq.com/serverless/deployment_tracking), or look for failures across microservices with [distributed tracing](https://docs.datadoghq.com/serverless/distributed_tracing).{{/is_alert}}\",\"name\":\"High Error Rate on {{functionname.name}} in {{region.name}} for {{aws_account.name}}\"}", "headers": { "Content-Type": "application/json", "DD-API-KEY": "apikey", "DD-APPLICATION-KEY": "appkey" }, "method": "POST" };
    const invalidRequestBody = { "body": "{\"tags\":[\"serverless_monitor_type:single_function\",\"serverless_monitor_id:high_error_rate\",\"aws_cloudformation_stack-id:cloudformation_stack_id\",\"created_by:dd_sls_plugin\",\"env:dev\",\"service:plugin-demo-ts\"],\"type\":\"metric alert\",\"query\":\"avg(last_15m):sum:aws.lambda.errors{aws_cloudformation_stack-id:cloudformation_stack_id} by {functionname,region,aws_account}.as_count() / sum:aws.lambda.invocations{aws_cloudformation_stack-id:cloudformation_stack_id} by {functionname,region,aws_account}.as_count() >= 0.1\",\"thresholds\":0.1,\"message\":\"More than 10% of the function’s invocations were errors in the selected time range. {{#is_alert}} Resolution: Examine the function’s logs, check for recent code or configuration changes with [Deployment Tracking](https://docs.datadoghq.com/serverless/deployment_tracking), or look for failures across microservices with [distributed tracing](https://docs.datadoghq.com/serverless/distributed_tracing).{{/is_alert}}\",\"name\":\"High Error Rate on {{functionname.name}} in {{region.name}} for {{aws_account.name}}\"}", "headers": { "Content-Type": "application/json", "DD-API-KEY": "apikey", "DD-APPLICATION-KEY": "appkey" }, "method": "POST" };
    afterEach(() => {
        (fetch as unknown as jest.Mock).mockClear();
    })
    it("returns true when syntax is valid", async () => {
        (fetch as unknown as jest.Mock).mockReturnValue({ status: 200 });
        const wasMonitorCreated = await createMonitor(monitorParams, "high_error_rate", "apikey", "appkey");
        expect(wasMonitorCreated).toBe(true);
        expect((fetch as unknown as jest.Mock)).toHaveBeenCalledWith("https://api.datadoghq.com/api/v1/monitor", validRequestBody);
        // expect((fetch as unknown as jest.Mock)).toHaveBeenCalledWith("https://api.datadoghq.com/api/v1/monitor", { "body": "{\"tags\":[\"serverless_monitor_type:single_function\",\"serverless_monitor_id:high_error_rate\",\"aws_cloudformation_stack-id:cloudformation_stack_id\",\"created_by:dd_sls_plugin\",\"env:dev\",\"service:plugin-demo-ts\"],\"options\":{},\"type\":\"metric alert\",\"query\":\"avg(last_15m):sum:aws.lambda.errors{aws_cloudformation_stack-id:cloudformation_stack_id} by {functionname,region,aws_account}.as_count() / sum:aws.lambda.invocations{aws_cloudformation_stack-id:cloudformation_stack_id} by {functionname,region,aws_account}.as_count() >= 0.1\",\"thresholds\":0.1,\"message\":\"More than 10% of the function’s invocations were errors in the selected time range. {{#is_alert}} Resolution: Examine the function’s logs, check for recent code or configuration changes with [Deployment Tracking](https://docs.datadoghq.com/serverless/deployment_tracking), or look for failures across microservices with [distributed tracing](https://docs.datadoghq.com/serverless/distributed_tracing).{{/is_alert}}\",\"name\":\"High Error Rate on {{functionname.name}} in {{region.name}} for {{aws_account.name}}\"}", "headers": { "Content-Type": "application/json", "DD-API-KEY": "apikey", "DD-APPLICATION-KEY": "appkey" }, "method": "POST" });
    });
    it("returns false and logs an Invalid Syntax Error when syntax is invalid", async () => {
        console.log = jest.fn();
        (fetch as unknown as jest.Mock).mockReturnValue({ status: 400 });
        const wasMonitorCreated = await createMonitor(invalidMonitorParams, "high_error_rate", "apikey", "appkey");
        expect(wasMonitorCreated).toBe(false);
        expect(console.log).toHaveBeenCalledWith("Invalid Syntax Error: Could not perform request due to incorrect syntax for high_error_rate");
        //expect((fetch as unknown as jest.Mock)).toHaveBeenCalledWith("https://api.datadoghq.com/api/v1/monitor", { "body": "{\"tags\":[\"serverless_monitor_type:single_function\",\"serverless_monitor_id:high_error_rate\",\"aws_cloudformation_stack-id:cloudformation_stack_id\",\"created_by:dd_sls_plugin\",\"env:dev\",\"service:plugin-demo-ts\"],\"type\":\"metric alert\",\"query\":\"avg(last_15m):sum:aws.lambda.errors{aws_cloudformation_stack-id:cloudformation_stack_id} by {functionname,region,aws_account}.as_count() / sum:aws.lambda.invocations{aws_cloudformation_stack-id:cloudformation_stack_id} by {functionname,region,aws_account}.as_count() >= 0.1\",\"thresholds\":0.1,\"message\":\"More than 10% of the function’s invocations were errors in the selected time range. {{#is_alert}} Resolution: Examine the function’s logs, check for recent code or configuration changes with [Deployment Tracking](https://docs.datadoghq.com/serverless/deployment_tracking), or look for failures across microservices with [distributed tracing](https://docs.datadoghq.com/serverless/distributed_tracing).{{/is_alert}}\",\"name\":\"High Error Rate on {{functionname.name}} in {{region.name}} for {{aws_account.name}}\"}", "headers": { "Content-Type": "application/json", "DD-API-KEY": "apikey", "DD-APPLICATION-KEY": "appkey" }, "method": "POST" });
        expect((fetch as unknown as jest.Mock)).toHaveBeenCalledWith("https://api.datadoghq.com/api/v1/monitor", invalidRequestBody);

    });
    it("throws an Invalid Authentication Error when authentication is invalid", async () => {
        (fetch as unknown as jest.Mock).mockReturnValue({ status: 403 });
        expect(async () => await createMonitor(monitorParams, "high_error_rate", "apikey", "appkey")).rejects.toThrow(InvalidAuthenticationError);
    });
})

describe("updateMonitor", () => {

    const validRequestBody = { "body": "{\"tags\":[\"serverless_monitor_type:single_function\",\"serverless_monitor_id:high_error_rate\",\"aws_cloudformation_stack-id:cloudformation_stack_id\",\"created_by:dd_sls_plugin\",\"env:dev\",\"service:plugin-demo-ts\"],\"options\":{},\"type\":\"metric alert\",\"query\":\"avg(last_15m):sum:aws.lambda.errors{aws_cloudformation_stack-id:cloudformation_stack_id} by {functionname,region,aws_account}.as_count() / sum:aws.lambda.invocations{aws_cloudformation_stack-id:cloudformation_stack_id} by {functionname,region,aws_account}.as_count() >= 0.1\",\"thresholds\":0.1,\"message\":\"More than 10% of the function’s invocations were errors in the selected time range. {{#is_alert}} Resolution: Examine the function’s logs, check for recent code or configuration changes with [Deployment Tracking](https://docs.datadoghq.com/serverless/deployment_tracking), or look for failures across microservices with [distributed tracing](https://docs.datadoghq.com/serverless/distributed_tracing).{{/is_alert}}\",\"name\":\"High Error Rate on {{functionname.name}} in {{region.name}} for {{aws_account.name}}\"}", "headers": { "Content-Type": "application/json", "DD-API-KEY": "apikey", "DD-APPLICATION-KEY": "appkey" }, "method": "PUT" };
    const invalidRequestBody = { "body": "{\"tags\":[\"serverless_monitor_type:single_function\",\"serverless_monitor_id:high_error_rate\",\"aws_cloudformation_stack-id:cloudformation_stack_id\",\"created_by:dd_sls_plugin\",\"env:dev\",\"service:plugin-demo-ts\"],\"type\":\"metric alert\",\"query\":\"avg(last_15m):sum:aws.lambda.errors{aws_cloudformation_stack-id:cloudformation_stack_id} by {functionname,region,aws_account}.as_count() / sum:aws.lambda.invocations{aws_cloudformation_stack-id:cloudformation_stack_id} by {functionname,region,aws_account}.as_count() >= 0.1\",\"thresholds\":0.1,\"message\":\"More than 10% of the function’s invocations were errors in the selected time range. {{#is_alert}} Resolution: Examine the function’s logs, check for recent code or configuration changes with [Deployment Tracking](https://docs.datadoghq.com/serverless/deployment_tracking), or look for failures across microservices with [distributed tracing](https://docs.datadoghq.com/serverless/distributed_tracing).{{/is_alert}}\",\"name\":\"High Error Rate on {{functionname.name}} in {{region.name}} for {{aws_account.name}}\"}", "headers": { "Content-Type": "application/json", "DD-API-KEY": "apikey", "DD-APPLICATION-KEY": "appkey" }, "method": "PUT" };
    afterEach(() => {
        (fetch as unknown as jest.Mock).mockClear();
    })
    it("returns true when syntax is valid", async () => {
        (fetch as unknown as jest.Mock).mockReturnValue({ status: 200 });
        const wasMonitorUpdated = await updateMonitor(12345, "high_error_rate", monitorParams, "apikey", "appkey");
        expect(wasMonitorUpdated).toBe(true);
        expect((fetch as unknown as jest.Mock)).toHaveBeenCalledWith("https://api.datadoghq.com/api/v1/monitor/12345", validRequestBody);
        //expect((fetch as unknown as jest.Mock)).toHaveBeenCalledWith("https://api.datadoghq.com/api/v1/monitor/12345", { "body": "{\"tags\":[\"serverless_monitor_type:single_function\",\"serverless_monitor_id:high_error_rate\",\"aws_cloudformation_stack-id:cloudformation_stack_id\",\"created_by:dd_sls_plugin\",\"env:dev\",\"service:plugin-demo-ts\"],\"options\":{},\"type\":\"metric alert\",\"query\":\"avg(last_15m):sum:aws.lambda.errors{aws_cloudformation_stack-id:cloudformation_stack_id} by {functionname,region,aws_account}.as_count() / sum:aws.lambda.invocations{aws_cloudformation_stack-id:cloudformation_stack_id} by {functionname,region,aws_account}.as_count() >= 0.1\",\"thresholds\":0.1,\"message\":\"More than 10% of the function’s invocations were errors in the selected time range. {{#is_alert}} Resolution: Examine the function’s logs, check for recent code or configuration changes with [Deployment Tracking](https://docs.datadoghq.com/serverless/deployment_tracking), or look for failures across microservices with [distributed tracing](https://docs.datadoghq.com/serverless/distributed_tracing).{{/is_alert}}\",\"name\":\"High Error Rate on {{functionname.name}} in {{region.name}} for {{aws_account.name}}\"}", "headers": { "Content-Type": "application/json", "DD-API-KEY": "apikey", "DD-APPLICATION-KEY": "appkey" }, "method": "PUT" });
    });
    it("returns false and logs an Invalid Syntax Error when syntax is invalid", async () => {
        console.log = jest.fn();
        (fetch as unknown as jest.Mock).mockReturnValue({ status: 400 });
        const wasMonitorUpdated = await updateMonitor(12345, "high_error_rate", invalidMonitorParams, "apikey", "appkey");
        expect(wasMonitorUpdated).toBe(false)
        expect((fetch as unknown as jest.Mock)).toHaveBeenCalledWith("https://api.datadoghq.com/api/v1/monitor/12345", invalidRequestBody);
        expect(console.log).toHaveBeenCalledWith("Invalid Syntax Error: Could not perform request due to incorrect syntax for high_error_rate");
    });
    it("throws an Invalid Authentication Error when authentication is invalid", async () => {
        (fetch as unknown as jest.Mock).mockReturnValue({ status: 403 });
        expect(async () => await updateMonitor(12345, "high_error_rate", monitorParams, "apikey", "appkey")).rejects.toThrow(InvalidAuthenticationError);
    });
})

describe("deleteMonitor", () => {
    const validRequestBody = { "headers": { "Content-Type": "application/json", "DD-API-KEY": "apikey", "DD-APPLICATION-KEY": "appkey" }, "method": "DELETE" };
    afterEach(() => {
        (fetch as unknown as jest.Mock).mockClear();
    })
    it("returns true when syntax is valid", async () => {
        (fetch as unknown as jest.Mock).mockReturnValue({ status: 200 });
        const wasMonitorDeleted = await deleteMonitor(12345, "high_error_rate", "apikey", "appkey");
        expect(wasMonitorDeleted).toBe(true);
        //expect((fetch as unknown as jest.Mock)).toHaveBeenCalledWith("https://api.datadoghq.com/api/v1/monitor/12345", { "headers": { "Content-Type": "application/json", "DD-API-KEY": "apikey", "DD-APPLICATION-KEY": "appkey" }, "method": "DELETE" });
        expect((fetch as unknown as jest.Mock)).toHaveBeenCalledWith("https://api.datadoghq.com/api/v1/monitor/12345", validRequestBody);

    });
    it("returns false and throws an Invalid Authentication Error when authentication is invalid", async () => {
        (fetch as unknown as jest.Mock).mockReturnValue({ status: 403 });
        expect(async () => await deleteMonitor(1234, "high_error_rate", "apikey", "appkey")).rejects.toThrow(InvalidAuthenticationError);
    });
})

describe("searchMonitor", () => {

    it("returns monitor data", async () => {

        (fetch as unknown as jest.Mock).mockReturnValue({
            status: 200, json: () => ({
                "monitors": {
                    status: 'No Data',
                    scopes: [
                        'aws_cloudformation_stack-id:cloudformation_stack_id'
                    ],
                    classification: 'metric',
                    creator: {
                        handle: 'datadog@datadoghq.com',
                        id: 1234567,
                        name: 'H Jiang'
                    },
                    metrics: ['aws.lambda.enhanced.estimated_cost'],
                    notifications: [],
                    muted_until_ts: null,
                    query: 'pct_change(avg(last_5m),last_5m):avg:aws.lambda.enhanced.estimated_cost{aws_cloudformation_stack-id:cloudformation_stack_id} > 20',
                    id: 1234567,
                    last_triggered_ts: null,
                    name: 'Increased Cost',
                    tags: [
                        'service:plugin-demo-ts',
                        'created_by:dd_sls_plugin',
                        'serverless_monitor_type:single_function',
                        'aws_cloudformation_stack-id:cloudformation_stack_id',
                        'serverless_monitor_id:increased_cost',
                        'env:dev'
                    ],
                    org_id: 1234567,
                    priority: null,
                    overall_state_modified: 1234567,
                    restricted_roles: [],
                    type: 'query alert'
                },
            })
        });
        const data = await searchMonitors("queryTag", "apikey", "appkey");
        // const monitors = data.monitors[0]
        expect(data).toEqual({
            status: 'No Data',
            scopes: [
                'aws_cloudformation_stack-id:cloudformation_stack_id'
            ],
            classification: 'metric',
            creator: {
                handle: 'datadog@datadoghq.com',
                id: 1234567,
                name: 'H Jiang'
            },
            metrics: ['aws.lambda.enhanced.estimated_cost'],
            notifications: [],
            muted_until_ts: null,
            query: 'pct_change(avg(last_5m),last_5m):avg:aws.lambda.enhanced.estimated_cost{aws_cloudformation_stack-id:cloudformation_stack_id} > 20',
            id: 1234567,
            last_triggered_ts: null,
            name: 'Increased Cost',
            tags: [
                'service:plugin-demo-ts',
                'created_by:dd_sls_plugin',
                'serverless_monitor_type:single_function',
                'aws_cloudformation_stack-id:cloudformation_stack_id',
                'serverless_monitor_id:increased_cost',
                'env:dev'
            ],
            org_id: 1234567,
            priority: null,
            overall_state_modified: 1234567,
            restricted_roles: [],
            type: 'query alert'
        });
    });
    it("throws an Invalid Authentication Error when authentication is invalid", async () => {
        (fetch as unknown as jest.Mock).mockReturnValue({ status: 403 });
        expect(async () => await searchMonitors("queryString", "apikey", "appkey")).rejects.toThrowError('Could not perform request due to invalid authentication');
    });
})
