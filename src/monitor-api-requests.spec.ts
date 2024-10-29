import fetch from "node-fetch";
import {
  createMonitor,
  updateMonitor,
  deleteMonitor,
  searchMonitors,
  getRecommendedMonitors,
  parseRecommendedMonitorServerlessId,
  RecommendedMonitorParams,
} from "./monitor-api-requests";
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

const templateVariables = [
  {
    defaults: ["{{functionname.name}}"],
    prefix: "",
    name: "functionName",
    available_values: [],
  },
  {
    defaults: ["{{region.name}}"],
    prefix: "",
    name: "regionName",
    available_values: [],
  },
  {
    defaults: ["{{aws_account.name}}"],
    prefix: "",
    name: "awsAccount",
    available_values: [],
  },
  {
    defaults: ["*"],
    prefix: "",
    name: "scope",
    available_values: [],
  },
];

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

describe("getRecommendedMonitors", () => {
  const validRequestBody = {
    headers: { "Content-Type": "application/json", "DD-API-KEY": "apiKey", "DD-APPLICATION-KEY": "appKey" },
    method: "GET",
  };
  afterEach(() => {
    (fetch as unknown as jest.Mock).mockClear();
  });
  it("returns recommended monitors", async () => {
    (fetch as unknown as jest.Mock).mockReturnValue({
      status: 200,
      json: () => ({
        data: [
          {
            type: "recommended-monitor",
            id: "serverless-[enhanced_metrics]_lambda_function_cold_start_rate_is_high",
            attributes: {
              classification: "metric",
              query:
                "sum(last_15m):sum:aws.lambda.enhanced.invocations{cold_start:true,$scope} by {aws_account,functionname,region}.as_count() / sum:aws.lambda.enhanced.invocations{$scope} by {aws_account,functionname,region}.as_count() >= 0.2",
              message:
                "More than 20% of the function’s invocations were cold starts in the selected time range. Datadog’s [enhanced metrics](https://docs.datadoghq.com/serverless/enhanced_lambda_metrics) and [distributed tracing](https://docs.datadoghq.com/serverless/distributed_tracing) can help you understand the impact of cold starts on your applications today. {{#is_alert}} Resolution: Cold starts occur when your serverless applications receive sudden increases in traffic, and can occur when the function was previously inactive or when it was receiving a relatively constant number of requests. Users may perceive cold starts as slow response times or lag. To get ahead of cold starts, consider enabling [provisioned concurrency](https://www.datadoghq.com/blog/monitor-aws-lambda-provisioned-concurrency/) on your impacted Lambda functions. Note that this could affect your AWS bill. {{/is_alert}}",
              title: "Lambda function cold start rate is high",
              description:
                "A cold start occurs when an AWS Lambda function is invoked after not being used for an extended period of time resulting in increased invocation latency. This monitor tracks the percentage of cold start invocations of your lambda functions.",
              type: "query alert",
              options: {
                thresholds: { critical: 0.2 },
                notify_no_data: false,
                silenced: {},
                notify_audit: false,
                new_host_delay: 300,
                include_tags: true,
              },
              integration_title: "Serverless",
              integration_id: "serverless",
              template_variables: templateVariables,
              tags: ["serverless_id:high_cold_start_rate", "created_by:dd_sls_app"],
              integration: "serverless",
              last_updated_at: 1696896000000,
              meta_tags: ["product:serverless", "integration:amazon-lambda"],
              name: "High Cold Start Rate on $functionName in $regionName for $awsAccount",
              recommended_monitor_metadata: {
                matcher: "serverless_id:high_cold_start_rate",
              },
              version: 2,
              created_at: 1696896000000,
            },
          },
          {
            type: "recommended-monitor",
            id: "serverless-lambda_function_invocations_are_failing",
            attributes: {
              classification: "metric",
              query:
                "avg(last_15m):sum:aws.lambda.errors{$scope} by {functionname,region,aws_account}.as_count() / sum:aws.lambda.invocations{$scope} by {functionname,region,aws_account}.as_count() >= 0.1",
              message:
                "More than 10% of the function’s invocations were errors in the selected time range. {{#is_alert}} Resolution: Examine the function’s logs, check for recent code or configuration changes with [Deployment Tracking](https://docs.datadoghq.com/serverless/deployment_tracking), or look for failures across microservices with [distributed tracing](https://docs.datadoghq.com/serverless/distributed_tracing).{{/is_alert}}",
              title: "Lambda function invocations are failing",
              description:
                "Lambda function invocation errors can be caused by issues with request parameters, event structure, function settings, user permissions, resource permissions, or limits. This monitor tracks the percentage of failing invocations.",
              type: "query alert",
              options: {
                thresholds: { critical: 0.1 },
                notify_no_data: false,
                silenced: {},
                notify_audit: false,
                new_host_delay: 300,
                include_tags: true,
              },
              integration_title: "Serverless",
              integration_id: "serverless",
              template_variables: [
                {
                  defaults: ["{{functionname.name}}"],
                  prefix: "",
                  name: "functionName",
                  available_values: [],
                },
                {
                  defaults: ["{{region.name}}"],
                  prefix: "",
                  name: "regionName",
                  available_values: [],
                },
                {
                  defaults: ["{{aws_account.name}}"],
                  prefix: "",
                  name: "awsAccount",
                  available_values: [],
                },
                {
                  defaults: ["*"],
                  prefix: "",
                  name: "scope",
                  available_values: [],
                },
              ],
              tags: ["serverless_id:high_error_rate", "created_by:dd_sls_app"],
              integration: "serverless",
              last_updated_at: 1696896000000,
              meta_tags: ["product:serverless", "integration:amazon-lambda"],
              name: "High Error Rate on $functionName in $regionName for $awsAccount",
              recommended_monitor_metadata: {
                matcher: "serverless_id:high_error_rate",
              },
              version: 2,
              created_at: 1696896000000,
            },
          },
          {
            type: "recommended-monitor",
            id: "serverless-lambda_function's_iterator_age_is_increasing",
            attributes: {
              classification: "metric",
              query:
                "avg(last_15m):min:aws.lambda.iterator_age.maximum{$scope} by {aws_account,region,functionname} >= 86400",
              message:
                "The function’s iterator was older than 24 hours. Iterator age measures the age of the last record for each batch of records processed from a stream. When this value increases, it means your function cannot process data fast enough. {{#is_alert}} Resolution: Enable [distributed tracing](https://docs.datadoghq.com/serverless/distributed_tracing) to isolate why your function has so much data being streamed to it. You can also consider increasing the shard count and batch size of the stream your function reads from. {{/is_alert}}",
              title: "Lambda function's iterator age is increasing",
              description:
                "A Lambda function's iterator age increases when the function can't efficiently process the data that's written to the streams that invoke the function. When it exceeds the retention period, data will be missed. This monitor tracks the iterator age for each lambda function.",
              type: "query alert",
              options: {
                thresholds: { critical: 86400 },
                notify_no_data: false,
                silenced: {},
                notify_audit: false,
                new_host_delay: 300,
                include_tags: true,
              },
              integration_title: "Serverless",
              integration_id: "serverless",
              template_variables: [
                {
                  defaults: ["{{functionname.name}}"],
                  prefix: "",
                  name: "functionName",
                  available_values: [],
                },
                {
                  defaults: ["{{region.name}}"],
                  prefix: "",
                  name: "regionName",
                  available_values: [],
                },
                {
                  defaults: ["{{aws_account.name}}"],
                  prefix: "",
                  name: "awsAccount",
                  available_values: [],
                },
                {
                  defaults: ["*"],
                  prefix: "",
                  name: "scope",
                  available_values: [],
                },
              ],
              tags: ["serverless_id:high_iterator_age", "created_by:dd_sls_app"],
              integration: "serverless",
              last_updated_at: 1696896000000,
              meta_tags: ["product:serverless", "integration:amazon-lambda"],
              name: "High Iterator Age on $functionName in $regionName for $awsAccount",
              recommended_monitor_metadata: {
                matcher: "serverless_id:high_iterator_age",
              },
              version: 2,
              created_at: 1696896000000,
            },
          },
          {
            type: "recommended-monitor",
            id: "serverless-lambda_function_invocations_are_throttling",
            attributes: {
              classification: "metric",
              query:
                "sum(last_15m):sum:aws.lambda.throttles {$scope} by {aws_account,region,functionname}.as_count() / ( sum:aws.lambda.throttles {$scope} by {aws_account,region,functionname}.as_count() + sum:aws.lambda.invocations{aws_cloudformation_stack-id:$scope} by {aws_account,region,functionname}.as_count()) >= 0.2",
              message:
                "More than 10% of invocations in the selected time range were throttled. Throttling occurs when your serverless Lambda applications receive high levels of traffic without adequate [concurrency](https://docs.aws.amazon.com/lambda/latest/dg/configuration-concurrency.html). {{#is_alert}} Resolution: Check your [Lambda concurrency metrics](https://docs.datadoghq.com/integrations/amazon_lambda/#metrics) and confirm if `aws.lambda.concurrent_executions.maximum` is approaching your AWS account concurrency level. If so, consider configuring reserved concurrency, or request a service quota increase from AWS. Note that this may affect your AWS bill. {{/is_alert}}",
              title: "Lambda function invocations are throttling",
              description:
                "Throttling in AWS Lambda occurs when function invocations exceed the amount of available concurrency units. This causes your function not to run and you get a RateExceeded exception. This monitor tracks the percentage of throttling invocations.",
              type: "query alert",
              options: {
                thresholds: { critical: 0.2 },
                notify_no_data: false,
                silenced: {},
                notify_audit: false,
                new_host_delay: 300,
                include_tags: true,
              },
              integration_title: "Serverless",
              integration_id: "serverless",
              template_variables: [
                {
                  defaults: ["{{functionname.name}}"],
                  prefix: "",
                  name: "functionName",
                  available_values: [],
                },
                {
                  defaults: ["{{region.name}}"],
                  prefix: "",
                  name: "regionName",
                  available_values: [],
                },
                {
                  defaults: ["{{aws_account.name}}"],
                  prefix: "",
                  name: "awsAccount",
                  available_values: [],
                },
                {
                  defaults: ["*"],
                  prefix: "",
                  name: "scope",
                  available_values: [],
                },
              ],
              tags: ["serverless_id:high_throttles", "created_by:dd_sls_app"],
              integration: "serverless",
              last_updated_at: 1696896000000,
              meta_tags: ["product:serverless", "integration:amazon-lambda"],
              name: "High Throttles on $functionName in $regionName for $awsAccount",
              recommended_monitor_metadata: {
                matcher: "serverless_id:high_throttles",
              },
              version: 2,
              created_at: 1696896000000,
            },
          },
          // A misconfigured recommended monitor where the serverless_id tag is missing. It should be ignored by getRecommendedMonitors().
          {
            type: "recommended-monitor",
            id: "serverless-lambda_function_is_timing_out",
            attributes: {
              classification: "metric",
              query:
                "max(last_15m):floor(max:aws.lambda.duration.maximum{$scope} by {aws_account,functionname,region} / (max:aws.lambda.timeout{$scope} by {aws_account,functionname,region} * 1000)) >= 1",
              message:
                "At least one invocation in the evaluated time range timed out. This occurs when your function runs for longer than the configured timeout or the global Lambda timeout. \n {{#is_alert}} Resolution: \n * View slow traces for this function to help you pinpoint slow requests to APIs and other microservices.\n * You can also consider increasing the timeout of your function. Note that this could affect your AWS bill. {{/is_alert}}",
              title: "Lambda function is timing out",
              description:
                "Lambda functions have a configurable limited execution time beyond which execution will stop immediately. This monitor can alert when such a timeout is detected.",
              type: "query alert",
              options: {
                thresholds: { critical: 1 },
                notify_no_data: false,
                silenced: {},
                notify_audit: false,
                new_host_delay: 300,
                include_tags: false,
              },
              integration_title: "Serverless",
              integration_id: "serverless",
              template_variables: [
                {
                  defaults: ["{{functionname.name}}"],
                  prefix: "",
                  name: "functionName",
                  available_values: [],
                },
                {
                  defaults: ["{{region.name}}"],
                  prefix: "",
                  name: "regionName",
                  available_values: [],
                },
                {
                  defaults: ["{{aws_account.name}}"],
                  prefix: "",
                  name: "awsAccount",
                  available_values: [],
                },
                {
                  defaults: ["*"],
                  prefix: "",
                  name: "scope",
                  available_values: [],
                },
              ],
              tags: ["created_by:dd_sls_app"],
              integration: "serverless",
              last_updated_at: 1696896000000,
              meta_tags: ["product:serverless", "integration:amazon-lambda"],
              name: "Timeout on $functionName in $regionName for $awsAccount",
              recommended_monitor_metadata: {
                matcher: "serverless_id:timeout",
              },
              version: 2,
              created_at: 1696896000000,
            },
          },
        ],
        meta: {
          page: { total_filtered_count: 7, total_count: 7 },
          facets: {
            type: [{ count: 7, name: "query alert" }],
            integration: [{ count: 7, name: "serverless" }],
          },
        },
      }),
    });
    const response = await getRecommendedMonitors("datadoghq.com", "apiKey", "appKey");
    expect(JSON.stringify(response)).toEqual(
      JSON.stringify({
        high_cold_start_rate: {
          name: "High Cold Start Rate on $functionName in $regionName for $awsAccount",
          threshold: 0.2,
          message:
            "More than 20% of the function’s invocations were cold starts in the selected time range. Datadog’s [enhanced metrics](https://docs.datadoghq.com/serverless/enhanced_lambda_metrics) and [distributed tracing](https://docs.datadoghq.com/serverless/distributed_tracing) can help you understand the impact of cold starts on your applications today. {{#is_alert}} Resolution: Cold starts occur when your serverless applications receive sudden increases in traffic, and can occur when the function was previously inactive or when it was receiving a relatively constant number of requests. Users may perceive cold starts as slow response times or lag. To get ahead of cold starts, consider enabling [provisioned concurrency](https://www.datadoghq.com/blog/monitor-aws-lambda-provisioned-concurrency/) on your impacted Lambda functions. Note that this could affect your AWS bill. {{/is_alert}}",
          type: "query alert",
          query: (cloudFormationStackId: string, criticalThreshold: number) => {
            return `sum(last_15m):sum:aws.lambda.enh anced.invocations{cold_start:true,${cloudFormationStackId}} by {aws_account,functionname,region}.as_count() / sum:aws.lambda.enhanced.invocations{${cloudFormationStackId}} by {aws_account,functionname,region}.as_count() >= ${criticalThreshold}`;
          },
          templateVariables: templateVariables,
        },
        high_error_rate: {
          name: "High Error Rate on $functionName in $regionName for $awsAccount",
          threshold: 0.1,
          message:
            "More than 10% of the function’s invocations were errors in the selected time range. {{#is_alert}} Resolution: Examine the function’s logs, check for recent code or configuration changes with [Deployment Tracking](https://docs.datadoghq.com/serverless/deployment_tracking), or look for failures across microservices with [distributed tracing](https://docs.datadoghq.com/serverless/distributed_tracing).{{/is_alert}}",
          type: "query alert",
          query: (cloudFormationStackId: string, criticalThreshold: number) => {
            return `avg(last_15m):sum:aws.lambda.errors{${cloudFormationStackId}} by {functionname,region,aws_account}.as_count() / sum:aws.lambda.invocations${cloudFormationStackId}} by {functionname,region,aws_account}.as_count() >= ${criticalThreshold}`;
          },
          templateVariables: templateVariables,
        },
        high_iterator_age: {
          name: "High Iterator Age on $functionName in $regionName for $awsAccount",
          threshold: 86400,
          message:
            "The function’s iterator was older than 24 hours. Iterator age measures the age of the last record for each batch of records processed from a stream. When this value increases, it means your function cannot process data fast enough. {{#is_alert}} Resolution: Enable [distributed tracing](https://docs.datadoghq.com/serverless/distributed_tracing) to isolate why your function has so much data being streamed to it. You can also consider increasing the shard count and batch size of the stream your function reads from. {{/is_alert}}",
          type: "query alert",
          query: (cloudFormationStackId: string, criticalThreshold: number) => {
            return `avg(last_15m):min:aws.lambda.iterator_age.maximum${cloudFormationStackId}} by {aws_account,region,functionname} >= ${criticalThreshold}`;
          },
          templateVariables: templateVariables,
        },
        high_throttles: {
          name: "High Throttles on $functionName in $regionName for $awsAccount",
          threshold: 0.2,
          message:
            "More than 10% of invocations in the selected time range were throttled. Throttling occurs when your serverless Lambda applications receive high levels of traffic without adequate [concurrency](https://docs.aws.amazon.com/lambda/latest/dg/configuration-concurrency.html). {{#is_alert}} Resolution: Check your [Lambda concurrency metrics](https://docs.datadoghq.com/integrations/amazon_lambda/#metrics) and confirm if `aws.lambda.concurrent_executions.maximum` is approaching your AWS account concurrency level. If so, consider configuring reserved concurrency, or request a service quota increase from AWS. Note that this may affect your AWS bill. {{/is_alert}}",
          type: "query alert",
          query: (cloudFormationStackId: string, criticalThreshold: number) => {
            return `sum(last_15m):sum:aws.lambda.throttles {${cloudFormationStackId}} by {aws_account,region,functionname}.as_count() / ( sum:aws.lambda.throttles {$scope} by {aws_account,region,functionname}.as_count() + sum:aws.lambda.invocations{aws_cloudformation_stack-id:${cloudFormationStackId}} by {aws_account,region,functionname}.as_count()) >= ${criticalThreshold}`;
          },
          templateVariables: templateVariables,
        },
      }),
    );
    // use custom threshold values to test query function
    expect(response.high_cold_start_rate.query("cloudformation_stackid", 0.1)).toEqual(
      "sum(last_15m):sum:aws.lambda.enhanced.invocations{cold_start:true,aws_cloudformation_stack-id:cloudformation_stackid} by {aws_account,functionname,region}.as_count() / sum:aws.lambda.enhanced.invocations{aws_cloudformation_stack-id:cloudformation_stackid} by {aws_account,functionname,region}.as_count() >= 0.1",
    );
    expect(response.high_error_rate.query("cloudformation_stackid", 0.05)).toEqual(
      "avg(last_15m):sum:aws.lambda.errors{aws_cloudformation_stack-id:cloudformation_stackid} by {functionname,region,aws_account}.as_count() / sum:aws.lambda.invocations{aws_cloudformation_stack-id:cloudformation_stackid} by {functionname,region,aws_account}.as_count() >= 0.05",
    );
    expect(response.high_iterator_age.query("cloudformation_stackid", 1000)).toEqual(
      "avg(last_15m):min:aws.lambda.iterator_age.maximum{aws_cloudformation_stack-id:cloudformation_stackid} by {aws_account,region,functionname} >= 1000",
    );
    expect(response.high_throttles.query("cloudformation_stackid", 0.1)).toEqual(
      "sum(last_15m):sum:aws.lambda.throttles {aws_cloudformation_stack-id:cloudformation_stackid} by {aws_account,region,functionname}.as_count() / ( sum:aws.lambda.throttles {aws_cloudformation_stack-id:cloudformation_stackid} by {aws_account,region,functionname}.as_count() + sum:aws.lambda.invocations{aws_cloudformation_stack-id:aws_cloudformation_stack-id:cloudformation_stackid} by {aws_account,region,functionname}.as_count()) >= 0.1",
    );

    expect(fetch as unknown as jest.Mock).toHaveBeenCalledWith(
      "https://api.datadoghq.com/api/v2/monitor/recommended?count=50&start=0&search=tag%3A%22product%3Aserverless%22%20AND%20tag%3A%22integration%3Aamazon-lambda%22",
      validRequestBody,
    );
  });
});

describe("parseRecommendedMonitorServerlessId", () => {
  it("parses serverless id if serverless_id tag exists", async () => {
    const recommendedMonitorParams = {
      id: "cold_start_rate_is_high",
      attributes: {
        tags: ["created_by:dd_sls_app", "serverless_id:high_cold_start_rate"],
      },
    } as RecommendedMonitorParams;
    expect(parseRecommendedMonitorServerlessId(recommendedMonitorParams)).toBe("high_cold_start_rate");
  });

  it("returns undefined if serverless_id tag doesn't exist", async () => {
    const recommendedMonitorParams = {
      id: "cold_start_rate_is_high",
      attributes: {
        tags: ["created_by:dd_sls_app"],
      },
    } as RecommendedMonitorParams;
    expect(parseRecommendedMonitorServerlessId(recommendedMonitorParams)).toBeUndefined();
  });
});
