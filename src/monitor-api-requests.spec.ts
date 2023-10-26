import fetch from "node-fetch";
import { createMonitor, updateMonitor, deleteMonitor, searchMonitors } from "./monitor-api-requests";
import { MonitorParams, handleMonitorsApiResponse } from "./monitors";

jest.mock("node-fetch");

const monitorParams: MonitorParams = {
  tags: [
    "serverless_monitor_type:single_function",
    "serverless_monitor_id:high_error_rate",
    "aws_cloudformation_stack-id:cloudformation_stack_id",
    "created_by:dd_sls_plugin",
    "env:dev",
    "service:plugin-demo-ts",
  ],
  options: {},
  type: "metric alert",
  query:
    "avg(last_15m):sum:aws.lambda.errors{aws_cloudformation_stack-id:cloudformation_stack_id} by {functionname,region,aws_account}.as_count() / sum:aws.lambda.invocations{aws_cloudformation_stack-id:cloudformation_stack_id} by {functionname,region,aws_account}.as_count() >= 0.1",
  message:
    "More than 10% of the function’s invocations were errors in the selected time range. {{#is_alert}} Resolution: Examine the function’s logs, check for recent code or configuration changes with [Deployment Tracking](https://docs.datadoghq.com/serverless/deployment_tracking), or look for failures across microservices with [distributed tracing](https://docs.datadoghq.com/serverless/distributed_tracing).{{/is_alert}}",
  name: "High Error Rate on {{functionname.name}} in {{region.name}} for {{aws_account.name}}",
};

// Invalid – monitor missing options parameter
const invalidMonitorParams: MonitorParams = {
  tags: [
    "serverless_monitor_type:single_function",
    "serverless_monitor_id:high_error_rate",
    "aws_cloudformation_stack-id:cloudformation_stack_id",
    "created_by:dd_sls_plugin",
    "env:dev",
    "service:plugin-demo-ts",
  ],
  type: "metric alert",
  query:
    "avg(last_15m):sum:aws.lambda.errors{aws_cloudformation_stack-id:cloudformation_stack_id} by {functionname,region,aws_account}.as_count() / sum:aws.lambda.invocations{aws_cloudformation_stack-id:cloudformation_stack_id} by {functionname,region,aws_account}.as_count() >= 0.1",
  message:
    "More than 10% of the function’s invocations were errors in the selected time range. {{#is_alert}} Resolution: Examine the function’s logs, check for recent code or configuration changes with [Deployment Tracking](https://docs.datadoghq.com/serverless/deployment_tracking), or look for failures across microservices with [distributed tracing](https://docs.datadoghq.com/serverless/distributed_tracing).{{/is_alert}}",
  name: "High Error Rate on {{functionname.name}} in {{region.name}} for {{aws_account.name}}",
};

describe("createMonitor", () => {
  const validRequestBody = {
    body: '{"tags":["serverless_monitor_type:single_function","serverless_monitor_id:high_error_rate","aws_cloudformation_stack-id:cloudformation_stack_id","created_by:dd_sls_plugin","env:dev","service:plugin-demo-ts"],"options":{},"type":"metric alert","query":"avg(last_15m):sum:aws.lambda.errors{aws_cloudformation_stack-id:cloudformation_stack_id} by {functionname,region,aws_account}.as_count() / sum:aws.lambda.invocations{aws_cloudformation_stack-id:cloudformation_stack_id} by {functionname,region,aws_account}.as_count() >= 0.1","message":"More than 10% of the function’s invocations were errors in the selected time range. {{#is_alert}} Resolution: Examine the function’s logs, check for recent code or configuration changes with [Deployment Tracking](https://docs.datadoghq.com/serverless/deployment_tracking), or look for failures across microservices with [distributed tracing](https://docs.datadoghq.com/serverless/distributed_tracing).{{/is_alert}}","name":"High Error Rate on {{functionname.name}} in {{region.name}} for {{aws_account.name}}"}',
    headers: { "Content-Type": "application/json", "DD-API-KEY": "apikey", "DD-APPLICATION-KEY": "appkey" },
    method: "POST",
  };
  const invalidRequestBody = {
    body: '{"tags":["serverless_monitor_type:single_function","serverless_monitor_id:high_error_rate","aws_cloudformation_stack-id:cloudformation_stack_id","created_by:dd_sls_plugin","env:dev","service:plugin-demo-ts"],"type":"metric alert","query":"avg(last_15m):sum:aws.lambda.errors{aws_cloudformation_stack-id:cloudformation_stack_id} by {functionname,region,aws_account}.as_count() / sum:aws.lambda.invocations{aws_cloudformation_stack-id:cloudformation_stack_id} by {functionname,region,aws_account}.as_count() >= 0.1","message":"More than 10% of the function’s invocations were errors in the selected time range. {{#is_alert}} Resolution: Examine the function’s logs, check for recent code or configuration changes with [Deployment Tracking](https://docs.datadoghq.com/serverless/deployment_tracking), or look for failures across microservices with [distributed tracing](https://docs.datadoghq.com/serverless/distributed_tracing).{{/is_alert}}","name":"High Error Rate on {{functionname.name}} in {{region.name}} for {{aws_account.name}}"}',
    headers: { "Content-Type": "application/json", "DD-API-KEY": "apikey", "DD-APPLICATION-KEY": "appkey" },
    method: "POST",
  };
  afterEach(() => {
    (fetch as unknown as jest.Mock).mockClear();
  });
  it("returns true when syntax is valid", async () => {
    (fetch as unknown as jest.Mock).mockReturnValue({ status: 200 });
    const response = await createMonitor("datadoghq.com", monitorParams, "apikey", "appkey");
    expect(response.status).toBe(200);
    expect(fetch as unknown as jest.Mock).toHaveBeenCalledWith(
      "https://api.datadoghq.com/api/v1/monitor",
      validRequestBody,
    );
  });
  it("returns false and logs a 400 Bad Request when syntax is invalid", async () => {
    (fetch as unknown as jest.Mock).mockReturnValue({ status: 400 });
    const response = await createMonitor("datadoghq.com", invalidMonitorParams, "apikey", "appkey");
    expect(() => handleMonitorsApiResponse(response, "high_error_rate", "app", "datadoghq.com")).toThrowError(
      "400 Bad Request: This could be due to incorrect syntax or a missing required tag for high_error_rate. Have you looked at your monitor tag policies? https://app.datadoghq.com/monitors/settings/policies",
    );
    expect(response.status).toBe(400);
    expect(fetch as unknown as jest.Mock).toHaveBeenCalledWith(
      "https://api.datadoghq.com/api/v1/monitor",
      invalidRequestBody,
    );
  });
  it("returns an Error", async () => {
    (fetch as unknown as jest.Mock).mockReturnValue({ status: 403, statusText: "Unauthorized" });
    const response = await createMonitor("datadoghq.com", monitorParams, "apikey", "appkey");
    expect(() => handleMonitorsApiResponse(response, "high_error_rate")).toThrowError("403 Unauthorized");
    expect(response.status).toBe(403);
    expect(fetch as unknown as jest.Mock).toHaveBeenCalledWith(
      "https://api.datadoghq.com/api/v1/monitor",
      validRequestBody,
    );
  });
});

describe("updateMonitor", () => {
  const validRequestBody = {
    body: '{"tags":["serverless_monitor_type:single_function","serverless_monitor_id:high_error_rate","aws_cloudformation_stack-id:cloudformation_stack_id","created_by:dd_sls_plugin","env:dev","service:plugin-demo-ts"],"options":{},"type":"metric alert","query":"avg(last_15m):sum:aws.lambda.errors{aws_cloudformation_stack-id:cloudformation_stack_id} by {functionname,region,aws_account}.as_count() / sum:aws.lambda.invocations{aws_cloudformation_stack-id:cloudformation_stack_id} by {functionname,region,aws_account}.as_count() >= 0.1","message":"More than 10% of the function’s invocations were errors in the selected time range. {{#is_alert}} Resolution: Examine the function’s logs, check for recent code or configuration changes with [Deployment Tracking](https://docs.datadoghq.com/serverless/deployment_tracking), or look for failures across microservices with [distributed tracing](https://docs.datadoghq.com/serverless/distributed_tracing).{{/is_alert}}","name":"High Error Rate on {{functionname.name}} in {{region.name}} for {{aws_account.name}}"}',
    headers: { "Content-Type": "application/json", "DD-API-KEY": "apikey", "DD-APPLICATION-KEY": "appkey" },
    method: "PUT",
  };
  const invalidRequestBody = {
    body: '{"tags":["serverless_monitor_type:single_function","serverless_monitor_id:high_error_rate","aws_cloudformation_stack-id:cloudformation_stack_id","created_by:dd_sls_plugin","env:dev","service:plugin-demo-ts"],"type":"metric alert","query":"avg(last_15m):sum:aws.lambda.errors{aws_cloudformation_stack-id:cloudformation_stack_id} by {functionname,region,aws_account}.as_count() / sum:aws.lambda.invocations{aws_cloudformation_stack-id:cloudformation_stack_id} by {functionname,region,aws_account}.as_count() >= 0.1","message":"More than 10% of the function’s invocations were errors in the selected time range. {{#is_alert}} Resolution: Examine the function’s logs, check for recent code or configuration changes with [Deployment Tracking](https://docs.datadoghq.com/serverless/deployment_tracking), or look for failures across microservices with [distributed tracing](https://docs.datadoghq.com/serverless/distributed_tracing).{{/is_alert}}","name":"High Error Rate on {{functionname.name}} in {{region.name}} for {{aws_account.name}}"}',
    headers: { "Content-Type": "application/json", "DD-API-KEY": "apikey", "DD-APPLICATION-KEY": "appkey" },
    method: "PUT",
  };
  afterEach(() => {
    (fetch as unknown as jest.Mock).mockClear();
  });
  it("returns true when syntax is valid", async () => {
    (fetch as unknown as jest.Mock).mockReturnValue({ status: 200 });
    const response = await updateMonitor("datadoghq.com", 12345, monitorParams, "apikey", "appkey");
    expect(response.status).toBe(200);
    expect(fetch as unknown as jest.Mock).toHaveBeenCalledWith(
      "https://api.datadoghq.com/api/v1/monitor/12345",
      validRequestBody,
    );
  });
  it("returns false and logs 400 Bad Request when syntax is invalid", async () => {
    console.log = jest.fn();
    (fetch as unknown as jest.Mock).mockReturnValue({ status: 400 });
    const response = await updateMonitor("datadoghq.com", 12345, invalidMonitorParams, "apikey", "appkey");
    expect(() => handleMonitorsApiResponse(response, "high_error_rate", "app", "datadoghq.com")).toThrowError(
      "400 Bad Request: This could be due to incorrect syntax or a missing required tag for high_error_rate. Have you looked at your monitor tag policies? https://app.datadoghq.com/monitors/settings/policies",
    );
    expect(response.status).toBe(400);
    expect(fetch as unknown as jest.Mock).toHaveBeenCalledWith(
      "https://api.datadoghq.com/api/v1/monitor/12345",
      invalidRequestBody,
    );
  });
  it("throws an Invalid Authentication Error when authentication is invalid", async () => {
    (fetch as unknown as jest.Mock).mockReturnValue({ status: 403, statusText: "Unauthorized" });
    const response = await updateMonitor("datadoghq.com", 12345, monitorParams, "apikey", "appkey");
    expect(() => handleMonitorsApiResponse(response, "high_error_rate")).toThrowError("403 Unauthorized");
    expect(response.status).toBe(403);
    expect(fetch as unknown as jest.Mock).toHaveBeenCalledWith(
      "https://api.datadoghq.com/api/v1/monitor/12345",
      validRequestBody,
    );
  });
});

describe("deleteMonitor", () => {
  const validRequestBody = {
    headers: { "Content-Type": "application/json", "DD-API-KEY": "apikey", "DD-APPLICATION-KEY": "appkey" },
    method: "DELETE",
  };
  afterEach(() => {
    (fetch as unknown as jest.Mock).mockClear();
  });
  it("returns true when syntax is valid", async () => {
    (fetch as unknown as jest.Mock).mockReturnValue({ status: 200 });
    const response = await deleteMonitor("datadoghq.com", 12345, "apikey", "appkey");
    expect(response.status).toBe(200);
    expect(fetch as unknown as jest.Mock).toHaveBeenCalledWith(
      "https://api.datadoghq.com/api/v1/monitor/12345",
      validRequestBody,
    );
  });
  it("returns false and throws an Error", async () => {
    (fetch as unknown as jest.Mock).mockReturnValue({ status: 403, statusText: "Unauthorized" });
    const response = await deleteMonitor("datadoghq.com", 12345, "apikey", "appkey");
    expect(() => handleMonitorsApiResponse(response, "high_error_rate")).toThrowError("403 Unauthorized");
    expect(response.status).toBe(403);
    expect(fetch as unknown as jest.Mock).toHaveBeenCalledWith(
      "https://api.datadoghq.com/api/v1/monitor/12345",
      validRequestBody,
    );
  });
});

describe("searchMonitor", () => {
  it("returns monitor data", async () => {
    (fetch as unknown as jest.Mock).mockReturnValue({
      status: 200,
      json: () => ({
        metadata: { total_count: 3, page: 0, per_page: 30, page_count: 1 },
        monitors: [
          {
            status: "No Data",
            scopes: ["aws_cloudformation_stack-id:cloudformation_stack_id"],
            classification: "metric",
            creator: {
              handle: "datadog@datadoghq.com",
              id: 1234567,
              name: "H Jiang",
            },
            metrics: ["aws.lambda.enhanced.estimated_cost"],
            notifications: [],
            muted_until_ts: null,
            query:
              "pct_change(avg(last_5m),last_5m):avg:aws.lambda.enhanced.estimated_cost{aws_cloudformation_stack-id:cloudformation_stack_id} > 20",
            id: 1234567,
            last_triggered_ts: null,
            name: "Increased Cost",
            tags: [
              "service:plugin-demo-ts",
              "created_by:dd_sls_plugin",
              "serverless_monitor_type:single_function",
              "aws_cloudformation_stack-id:cloudformation_stack_id",
              "serverless_monitor_id:increased_cost",
              "env:dev",
            ],
            org_id: 1234567,
            priority: null,
            overall_state_modified: 1234567,
            restricted_roles: [],
            type: "query alert",
          },
        ],
      }),
    });
    const response = await searchMonitors("datadoghq.com", "queryTag", "apikey", "appkey");
    expect(response[0]).toEqual({
      status: "No Data",
      scopes: ["aws_cloudformation_stack-id:cloudformation_stack_id"],
      classification: "metric",
      creator: {
        handle: "datadog@datadoghq.com",
        id: 1234567,
        name: "H Jiang",
      },
      metrics: ["aws.lambda.enhanced.estimated_cost"],
      notifications: [],
      muted_until_ts: null,
      query:
        "pct_change(avg(last_5m),last_5m):avg:aws.lambda.enhanced.estimated_cost{aws_cloudformation_stack-id:cloudformation_stack_id} > 20",
      id: 1234567,
      last_triggered_ts: null,
      name: "Increased Cost",
      tags: [
        "service:plugin-demo-ts",
        "created_by:dd_sls_plugin",
        "serverless_monitor_type:single_function",
        "aws_cloudformation_stack-id:cloudformation_stack_id",
        "serverless_monitor_id:increased_cost",
        "env:dev",
      ],
      org_id: 1234567,
      priority: null,
      overall_state_modified: 1234567,
      restricted_roles: [],
      type: "query alert",
    });
  });
  it("returns multiple pages of monitor data", async () => {
    const fetchMock = (fetch as unknown as jest.Mock)
      .mockReturnValueOnce({
        status: 200,
        json: () => ({
          metadata: { total_count: 2, page: 0, per_page: 1, page_count: 2 },
          monitors: [
            {
              status: "No Data",
              scopes: ["aws_cloudformation_stack-id:cloudformation_stack_id"],
              classification: "metric",
              creator: {
                handle: "datadog@datadoghq.com",
                id: 1234567,
                name: "H Jiang",
              },
              metrics: ["aws.lambda.enhanced.estimated_cost"],
              notifications: [],
              muted_until_ts: null,
              query:
                "pct_change(avg(last_5m),last_5m):avg:aws.lambda.enhanced.estimated_cost{aws_cloudformation_stack-id:cloudformation_stack_id} > 20",
              id: 1234567,
              last_triggered_ts: null,
              name: "Increased Cost",
              tags: [
                "service:plugin-demo-ts",
                "created_by:dd_sls_plugin",
                "serverless_monitor_type:single_function",
                "aws_cloudformation_stack-id:cloudformation_stack_id",
                "serverless_monitor_id:increased_cost",
                "env:dev",
              ],
              org_id: 1234567,
              priority: null,
              overall_state_modified: 1234567,
              restricted_roles: [],
              type: "query alert",
            },
          ],
        }),
      })
      .mockReturnValue({
        status: 200,
        json: () => ({
          metadata: { total_count: 2, page: 1, per_page: 1, page_count: 2 },
          monitors: [
            {
              status: "No Data",
              scopes: ["aws_cloudformation_stack-id:cloudformation_stack_id"],
              classification: "metric",
              creator: {
                handle: "datadog@datadoghq.com",
                id: 1234567,
                name: "H Jiang",
              },
              metrics: ["aws.lambda.errors"],
              notifications: [],
              muted_until_ts: null,
              query: "sum(last_5m):sum:aws.lambda.errors{functionname:myFunction}.as_count() > 0.20",
              id: 1234568,
              last_triggered_ts: null,
              name: "myFunction High Errors",
              tags: [
                "service:plugin-demo-ts",
                "created_by:dd_sls_plugin",
                "serverless_monitor_type:single_function",
                "aws_cloudformation_stack-id:cloudformation_stack_id",
                "serverless_monitor_id:myFunction_high_errors",
                "env:dev",
              ],
              org_id: 1234567,
              priority: null,
              overall_state_modified: 1234567,
              restricted_roles: [],
              type: "query alert",
            },
          ],
        }),
      });
    const response = await searchMonitors("datadoghq.com", "queryTag", "apikey", "appkey");
    expect(fetchMock.mock.calls).toHaveLength(2);
    expect(response[0]).toEqual({
      status: "No Data",
      scopes: ["aws_cloudformation_stack-id:cloudformation_stack_id"],
      classification: "metric",
      creator: {
        handle: "datadog@datadoghq.com",
        id: 1234567,
        name: "H Jiang",
      },
      metrics: ["aws.lambda.enhanced.estimated_cost"],
      notifications: [],
      muted_until_ts: null,
      query:
        "pct_change(avg(last_5m),last_5m):avg:aws.lambda.enhanced.estimated_cost{aws_cloudformation_stack-id:cloudformation_stack_id} > 20",
      id: 1234567,
      last_triggered_ts: null,
      name: "Increased Cost",
      tags: [
        "service:plugin-demo-ts",
        "created_by:dd_sls_plugin",
        "serverless_monitor_type:single_function",
        "aws_cloudformation_stack-id:cloudformation_stack_id",
        "serverless_monitor_id:increased_cost",
        "env:dev",
      ],
      org_id: 1234567,
      priority: null,
      overall_state_modified: 1234567,
      restricted_roles: [],
      type: "query alert",
    });
    expect(response[1]).toEqual({
      status: "No Data",
      scopes: ["aws_cloudformation_stack-id:cloudformation_stack_id"],
      classification: "metric",
      creator: {
        handle: "datadog@datadoghq.com",
        id: 1234567,
        name: "H Jiang",
      },
      metrics: ["aws.lambda.errors"],
      notifications: [],
      muted_until_ts: null,
      query: "sum(last_5m):sum:aws.lambda.errors{functionname:myFunction}.as_count() > 0.20",
      id: 1234568,
      last_triggered_ts: null,
      name: "myFunction High Errors",
      tags: [
        "service:plugin-demo-ts",
        "created_by:dd_sls_plugin",
        "serverless_monitor_type:single_function",
        "aws_cloudformation_stack-id:cloudformation_stack_id",
        "serverless_monitor_id:myFunction_high_errors",
        "env:dev",
      ],
      org_id: 1234567,
      priority: null,
      overall_state_modified: 1234567,
      restricted_roles: [],
      type: "query alert",
    });
  });
  it("throws an Invalid Authentication Error when authentication is invalid", async () => {
    (fetch as unknown as jest.Mock).mockReturnValue({ status: 403, statusText: "Unauthorized" });
    await expect(
      async () => await searchMonitors("datadoghq.com", "queryString", "apikey", "appkey"),
    ).rejects.toThrowError("Can't fetch monitors. Status code: 403. Message: Unauthorized");
  });
});
