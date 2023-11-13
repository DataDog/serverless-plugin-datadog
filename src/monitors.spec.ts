import { createMonitor, deleteMonitor, getExistingMonitors, updateMonitor, getRecommendedMonitors } from "./monitor-api-requests";
import { Monitor, RecommendedMonitors, setMonitors, buildMonitorParams } from "./monitors";

jest.mock("./monitor-api-requests", () => ({
  createMonitor: jest.fn(),
  updateMonitor: jest.fn(),
  deleteMonitor: jest.fn(),
  getExistingMonitors: jest.fn(),
  getRecommendedMonitors: jest.fn(),
}));

const CUSTOM_MONITOR_1: Monitor = {
  custom_monitor_1: {
    name: "Custom Monitor 1",
    query:
      "max(next_1w):forecast(avg:system.load.1{*}, 'linear', 1, interval='60m', history='1w', model='default') >= 3",
  },
};

const CUSTOM_MONITOR_2: Monitor = {
  custom_monitor_2: {
    name: "Custom Monitor 2",
    query: "avg(last_15m):anomalies(avg:system.load.1{*}, 'basic', 2, direction='both') >= 1",
    tags: ["custom_monitor_2"],
    message: "This is a custom monitor",
    options: {
      renotify_interval: 0,
      timeout_h: 0,
      thresholds: { critical: 1 },
      notify_no_data: false,
      no_data_timeframe: 2,
      notify_audit: false,
      require_full_window: true,
    },
  },
};

const UPDATED_CUSTOM_MONITOR_2: Monitor = {
  custom_monitor_2: {
    name: "Custom Monitor 2",
    query: "avg(last_15m):anomalies(avg:system.load.1{*}, 'basic', 2, direction='both') >= 1",
    message: "This is a custom monitor",
  },
};

const INCREASED_COST_MONITOR: Monitor = {
  increased_cost: {
    name: "Increased Cost",
    query: "",
    message: "This is an increased cost monitor",
    options: {
      renotify_interval: 0,
      timeout_h: 0,
      thresholds: { warning: 1, critical: 25 }, // custom critical threshold value
      notify_no_data: false,
      no_data_timeframe: 2,
      notify_audit: false,
      require_full_window: true,
    },
  },
};

const TIMEOUT_MONITOR: Monitor = {
  timeout: {
    name: "Modified Timeout Monitor",
    query: "avg(last_15m):anomalies(avg:system.load.1{*}, 'basic', 2, direction='both') >= 1",
  },
};

const CUSTOM_MONITOR_1_PARAMS = {
  name: "Custom Monitor 1",
  query: "max(next_1w):forecast(avg:system.load.1{*}, 'linear', 1, interval='60m', history='1w', model='default') >= 3",
  tags: [
    "serverless_monitor_type:single_function",
    "serverless_monitor_id:custom_monitor_1",
    "aws_cloudformation_stack-id:cloud_formation_id",
    "created_by:dd_sls_plugin",
    "env:env",
    "service:service",
  ],
  options: {},
  type: "metric alert",
};
const CUSTOM_MONITOR_2_PARAMS = {
  name: "Custom Monitor 2",
  query: "avg(last_15m):anomalies(avg:system.load.1{*}, 'basic', 2, direction='both') >= 1",
  tags: [
    "custom_monitor_2",
    "serverless_monitor_type:single_function",
    "serverless_monitor_id:custom_monitor_2",
    "aws_cloudformation_stack-id:cloud_formation_id",
    "created_by:dd_sls_plugin",
    "env:env",
    "service:service",
  ],
  message: "This is a custom monitor",
  options: {
    renotify_interval: 0,
    timeout_h: 0,
    thresholds: { critical: 1 },
    notify_no_data: false,
    no_data_timeframe: 2,
    notify_audit: false,
    require_full_window: true,
  },
  type: "metric alert",
};
const UPDATED_CUSTOM_MONITOR_2_PARAMS = {
  name: "Custom Monitor 2",
  query: "avg(last_15m):anomalies(avg:system.load.1{*}, 'basic', 2, direction='both') >= 1",
  tags: [
    "serverless_monitor_type:single_function",
    "serverless_monitor_id:custom_monitor_2",
    "aws_cloudformation_stack-id:cloud_formation_id",
    "created_by:dd_sls_plugin",
    "env:env",
    "service:service",
  ],
  message: "This is a custom monitor",
  options: {},
  type: "metric alert",
};
const INCREASED_COST_MONITOR_PARAMS = {
  name: "Increased Cost",
  query:
    "pct_change(avg(last_5m),last_5m):avg:aws.lambda.enhanced.estimated_cost{aws_cloudformation_stack-id:cloud_formation_id} > 25",
  message: "This is an increased cost monitor",
  options: {
    renotify_interval: 0,
    timeout_h: 0,
    thresholds: { warning: 1, critical: 25 },
    notify_no_data: false,
    no_data_timeframe: 2,
    notify_audit: false,
    require_full_window: true,
  },
  tags: [
    "serverless_monitor_type:single_function",
    "serverless_monitor_id:increased_cost",
    "aws_cloudformation_stack-id:cloud_formation_id",
    "created_by:dd_sls_plugin",
    "env:env",
    "service:service",
  ],
  type: "metric alert",
};
const TIMEOUT_MONITOR_PARAMS = {
  name: "Modified Timeout Monitor",
  query:
    "avg(last_15m):sum:aws.lambda.duration.maximum{aws_cloudformation_stack-id:cloud_formation_id} by {aws_account,functionname,region}.as_count() / (sum:aws.lambda.timeout{aws_cloudformation_stack-id:cloud_formation_id} by {aws_account,functionname,region}.as_count() * 1000) >= 1",
  tags: [
    "serverless_monitor_type:single_function",
    "serverless_monitor_id:timeout",
    "aws_cloudformation_stack-id:cloud_formation_id",
    "created_by:dd_sls_plugin",
    "env:env",
    "service:service",
  ],
  options: {},
  type: "metric alert",
  message:
    "At least one invocation in the selected time range timed out. This occurs when your function runs for longer than the configured timeout or the global Lambda timeout. Resolution: [Distributed tracing](https://docs.datadoghq.com/serverless/distributed_tracing) can help you pinpoint slow requests to APIs and other microservices. You can also consider increasing the timeout of your function. Note that this could affect your AWS bill.",
};

const RECOMMENDED_MONITORS: RecommendedMonitors = {
  // high_cold_start_rate: {
  //   name: 'High Cold Start Rate on $functionName in $regionName for $awsAccount',
  //   threshold: 0.2,
  //   message: 'More than 20% of thte function’s invocations were cold starts in the selected time range. Datadog’s [enhanced metrics](https://docs.datadoghq.com/serverless/enhanced_lambda_metrics) and [distributed tracing](https://docs.datadoghq.com/serverless/distributed_tracing) can help you understand the impact of cold starts on your applications today. {{#is_alert}} Resolution: Cold starts occur when your serverless applications receive sudden increases in traffic, and can occur when the function was previously inactive or when it was receiving a relatively constant number of requests. Users may perceive cold starts as slow response times or lag. To get ahead of cold starts, consider enabling [provisioned concurrency](https://www.datadoghq.com/blog/monitor-aws-lambda-provisioned-concurrency/) on your impacted Lambda functions. Note that this could affect your AWS bill. {{/is_alert}}',
  //   type: 'query alert',
  //   query: (cloudFormationStackId: string,  criticalThreshold: number) => {      
  //     if (shouldReplaceCriticalThreshold) {
  //       return `sum(last_15m):sum:aws.lambda.enhanced.invocations{cold_start:true,aws_cloudformation_stack-id:${cloudFormationStackId}} by {aws_account,functionname,region}.as_count() / sum:aws.lambda.enhanced.invocations{aws_cloudformation_stack-id:${cloudFormationStackId}} by {aws_account,functionname,region}.as_count() >= 0.2`;
  //     } 
  //     return `sum(last_15m):sum:aws.lambda.enhanced.invocations{cold_start:true,aws_cloudformation_stack-id:${cloudFormationStackId}} by {aws_account,functionname,region}.as_count() / sum:aws.lambda.enhanced.invocations{aws_cloudformation_stack-id:${cloudFormationStackId}} by {aws_account,functionname,region}.as_count() >= ${criticalThreshold}`;
  //   },

  // },
  // high_error_rate: {
  //   name: 'High Error Rate on $functionName in $regionName for $awsAccount',
  //   threshold: 0.1,
  //   message: 'More than 10% of the function’s invocations were errors in the selected time range. {{#is_alert}} Resolution: Examine the function’s logs, check for recent code or configuration changes with [Deployment Tracking](https://docs.datadoghq.com/serverless/deployment_tracking), or look for failures across microservices with [distributed tracing](https://docs.datadoghq.com/serverless/distributed_tracing).{{/is_alert}}',
  //   type: 'query alert',
  //   query: (cloudFormationStackId: string,  criticalThreshold: number) => {      
  //     if (shouldReplaceCriticalThreshold) {
  //       return `avg(last_15m):sum:aws.lambda.errors{aws_cloudformation_stack-id:${cloudFormationStackId}} by {functionname,region,aws_account}.as_count() / sum:aws.lambda.invocationsaws_cloudformation_stack-id:${cloudFormationStackId}} by {functionname,region,aws_account}.as_count() >= ${criticalThreshold}`
  //     } 
  //     return `avg(last_15m):sum:aws.lambda.errors{${cloudFormationStackId} by {functionname,region,aws_account}.as_count() / sum:aws.lambda.invocationsaws_cloudformation_stack-id:${cloudFormationStackId}} by {functionname,region,aws_account}.as_count() >= 0.1`
  //   },
  // },
  // high_iterator_age: {
  //   name: 'High Iterator Age on $functionName in $regionName for $awsAccount',
  //   threshold: 86400,
  //   message: 'The function’s iterator was older than 24 hours. Iterator age measures the age of the last record for each batch of records processed from a stream. When this value increases, it means your function cannot process data fast enough. {{#is_alert}} Resolution: Enable [distributed tracing](https://docs.datadoghq.com/serverless/distributed_tracing) to isolate why your function has so much data being streamed to it. You can also consider increasing the shard count and batch size of the stream your function reads from. {{/is_alert}}',
  //   type: 'query alert',
  //   query: (cloudFormationStackId: string,  criticalThreshold: number) => {      
  //     if (shouldReplaceCriticalThreshold) {
  //       return `avg(last_15m):min:aws.lambda.iterator_age.maximumaws_cloudformation_stack-id:${cloudFormationStackId}} by {aws_account,region,functionname} >= ${criticalThreshold}`
  //     } 
  //     return `avg(last_15m):min:aws.lambda.iterator_age.maximum{aws_cloudformation_stack-id:${cloudFormationStackId}} by {aws_account,region,functionname} >= 86400`
  //   }
  // },
  // high_throttles: {
  //   name: 'High Throttles on $functionName in $regionName for $awsAccount',
  //   threshold: 0.2,
  //   message: 'More than 10% of invocations in the selected time range were throttled. Throttling occurs when your serverless Lambda applications receive high levels of traffic without adequate [concurrency](https://docs.aws.amazon.com/lambda/latest/dg/configuration-concurrency.html). {{#is_alert}} Resolution: Check your [Lambda concurrency metrics](https://docs.datadoghq.com/integrations/amazon_lambda/#metrics) and confirm if `aws.lambda.concurrent_executions.maximum` is approaching your AWS account concurrency level. If so, consider configuring reserved concurrency, or request a service quota increase from AWS. Note that this may affect your AWS bill. {{/is_alert}}',
  //   type: 'query alert',
  //   query: (cloudFormationStackId: string,  criticalThreshold: number) => {      
  //     if (shouldReplaceCriticalThreshold) {
  //       return `sum(last_15m):sum:aws.lambda.throttles {aws_cloudformation_stack-id:${cloudFormationStackId}} by {aws_account,region,functionname}.as_count() / ( sum:aws.lambda.throttles {$scope} by {aws_account,region,functionname}.as_count() + sum:aws.lambda.invocations{aws_cloudformation_stack-id:${cloudFormationStackId}} by {aws_account,region,functionname}.as_count()) >= ${criticalThreshold}`
  //     } 
  //     return `sum(last_15m):sum:aws.lambda.throttles {aws_cloudformation_stack-id:${cloudFormationStackId}} by {aws_account,region,functionname}.as_count() / ( sum:aws.lambda.throttles {$scope} by {aws_account,region,functionname}.as_count() + sum:aws.lambda.invocations{aws_cloudformation_stack-id:${cloudFormationStackId}} by {aws_account,region,functionname}.as_count()) >= 0.2`
  //   },
  // },
  increased_cost: {
    name: "Increased Cost on $functionName in $regionName for $awsAccount", 
    threshold: 0.2,
    message: "Estimated cost of invocations have increased more than 20%",
    query: (cloudFormationStackId: string,  criticalThreshold: number) => {      
      // if (shouldReplaceCriticalThreshold) {
      //   return `pct_change(avg(last_5m),last_5m):avg:aws.lambda.enhanced.estimated_cost{aws_cloudformation_stack-id:${cloudFormationStackId}} > ${criticalThreshold}`;
      // } 
      return `pct_change(avg(last_5m),last_5m):avg:aws.lambda.enhanced.estimated_cost{aws_cloudformation_stack-id:${cloudFormationStackId}} > ${criticalThreshold}`;
    },
  },
  timeout: {
    name: "Timeout on $functionName in $regionName for $awsAccount", 
    threshold: 1,
    message: "At least one invocation in the selected time range timed out. This occurs when your function runs for longer than the configured timeout or the global Lambda timeout. Resolution: [Distributed tracing](https://docs.datadoghq.com/serverless/distributed_tracing) can help you pinpoint slow requests to APIs and other microservices. You can also consider increasing the timeout of your function. Note that this could affect your AWS bill.",
    type: 'query alert',
    query: (cloudFormationStackId: string,  criticalThreshold: number) => {      
      // if (shouldReplaceCriticalThreshold) {
      //   return `sum(last_15m):sum:aws.lambda.duration.maximum{aws_cloudformation_stack-id:${cloudFormationStackId}} by {aws_account,functionname,region}.as_count() / (sum:aws.lambda.timeout{aws_cloudformation_stack-id:${cloudFormationStackId}} by {aws_account,functionname,region}.as_count() * 1000) >= ${criticalThreshold}`;
      // } 
      return `avg(last_15m):sum:aws.lambda.duration.maximum{aws_cloudformation_stack-id:${cloudFormationStackId}} by {aws_account,functionname,region}.as_count() / (sum:aws.lambda.timeout{aws_cloudformation_stack-id:${cloudFormationStackId}} by {aws_account,functionname,region}.as_count() * 1000) >= ${criticalThreshold}`;
    },
  }
}

const MONITOR_SET_1 = [CUSTOM_MONITOR_1, CUSTOM_MONITOR_2, INCREASED_COST_MONITOR];
const MONITOR_SET_2 = [CUSTOM_MONITOR_1, UPDATED_CUSTOM_MONITOR_2, TIMEOUT_MONITOR];
const MONITOR_SET_3 = [CUSTOM_MONITOR_1, INCREASED_COST_MONITOR];

describe("buildMonitorParams", () => {
  it("returns valid monitor params for a custom monitor", async () => {
    const monitorParams = buildMonitorParams(CUSTOM_MONITOR_1, "cloud_formation_id", "service", "env", RECOMMENDED_MONITORS);
    expect(monitorParams).toEqual(CUSTOM_MONITOR_1_PARAMS);
  });
  it("returns valid monitor params for a custom monitor", async () => {
    const monitorParams = buildMonitorParams(CUSTOM_MONITOR_2, "cloud_formation_id", "service", "env", RECOMMENDED_MONITORS);
    expect(monitorParams).toEqual(CUSTOM_MONITOR_2_PARAMS);
  });
  it("returns valid monitor params for an updated custom monitor", async () => {
    const monitorParams = buildMonitorParams(UPDATED_CUSTOM_MONITOR_2, "cloud_formation_id", "service", "env", RECOMMENDED_MONITORS);
    expect(monitorParams).toEqual(UPDATED_CUSTOM_MONITOR_2_PARAMS);
  });
  it("returns valid monitor params for Increased Cost monitor", async () => {
    const monitorParams = buildMonitorParams(INCREASED_COST_MONITOR, "cloud_formation_id", "service", "env", RECOMMENDED_MONITORS);
    expect(monitorParams).toEqual(INCREASED_COST_MONITOR_PARAMS);
  });
  it("returns valid monitor params for the Timeout monitor", async () => {
    const monitorParams = buildMonitorParams(TIMEOUT_MONITOR, "cloud_formation_id", "service", "env", RECOMMENDED_MONITORS);
    expect(monitorParams).toEqual(TIMEOUT_MONITOR_PARAMS);
  });
});

describe("setMonitors", () => {
  afterEach(() => {
    (createMonitor as unknown as jest.Mock).mockRestore();
    (updateMonitor as unknown as jest.Mock).mockRestore();
    (deleteMonitor as unknown as jest.Mock).mockRestore();
    (getExistingMonitors as unknown as jest.Mock).mockRestore();
    (getRecommendedMonitors as unknown as jest.Mock).mockRestore(); 
  });
  // it("returns recommended monitors", async () => {

  // })
  it("returns 'Successfully created custom_monitor_1'", async () => {
    (getRecommendedMonitors as unknown as jest.Mock).mockReturnValue({RECOMMENDED_MONITORS});
    (getExistingMonitors as unknown as jest.Mock).mockReturnValue({});
    (createMonitor as unknown as jest.Mock).mockReturnValue({ status: 200 });
    const logStatements = await setMonitors(
      "app",
      "datadoghq.com",
      [CUSTOM_MONITOR_1],
      "apikey",
      "appkey",
      "cloud_formation_id",
      "service",
      "env",
    );
    expect(logStatements).toEqual(["Successfully created custom_monitor_1"]);
    expect(createMonitor as unknown as jest.Mock).toHaveBeenCalledWith(
      "datadoghq.com",
      CUSTOM_MONITOR_1_PARAMS,
      "apikey",
      "appkey",
    );
  });
  it("returns 'Successfully updated custom_monitor_1', 'Successfully created custom_monitor_2, increased_cost'", async () => {
    (getRecommendedMonitors as unknown as jest.Mock).mockReturnValue({RECOMMENDED_MONITORS});
    (getExistingMonitors as unknown as jest.Mock).mockReturnValue({ custom_monitor_1: 123456 });
    (createMonitor as unknown as jest.Mock).mockReturnValue({ status: 200 });
    (updateMonitor as unknown as jest.Mock).mockReturnValue({ status: 200 });
    const logStatements = await setMonitors(
      "app",
      "datadoghq.com",
      MONITOR_SET_1,
      "apikey",
      "appkey",
      "cloud_formation_id",
      "service",
      "env",
    );
    expect(logStatements).toEqual([
      "Successfully updated custom_monitor_1",
      "Successfully created custom_monitor_2, increased_cost",
    ]);
    expect(createMonitor as unknown as jest.Mock).toHaveBeenCalledWith(
      "datadoghq.com",
      CUSTOM_MONITOR_2_PARAMS,
      "apikey",
      "appkey",
    );
    expect(createMonitor as unknown as jest.Mock).toHaveBeenCalledWith(
      "datadoghq.com",
      INCREASED_COST_MONITOR_PARAMS,
      "apikey",
      "appkey",
    );
  });
  it("returns 'Successfully updated custom_monitor_1, custom_monitor_2', 'Successfully created timeout', 'Successfully deleted increased_cost'", async () => {
    (getRecommendedMonitors as unknown as jest.Mock).mockReturnValue({RECOMMENDED_MONITORS});
    (getExistingMonitors as unknown as jest.Mock).mockReturnValue({
      custom_monitor_1: 123456,
      custom_monitor_2: 123456,
      increased_cost: 123456,
    });
    (createMonitor as unknown as jest.Mock).mockReturnValue({ status: 200 });
    (updateMonitor as unknown as jest.Mock).mockReturnValue({ status: 200 });
    (deleteMonitor as unknown as jest.Mock).mockReturnValue({ status: 200 });
    const logStatements = await setMonitors(
      "app",
      "datadoghq.com",
      MONITOR_SET_2,
      "apikey",
      "appkey",
      "cloud_formation_id",
      "service",
      "env",
    );
    expect(logStatements).toEqual([
      "Successfully updated custom_monitor_1, custom_monitor_2",
      "Successfully created timeout",
      "Successfully deleted increased_cost",
    ]);
    expect(updateMonitor as unknown as jest.Mock).toHaveBeenCalledWith(
      "datadoghq.com",
      123456,
      CUSTOM_MONITOR_1_PARAMS,
      "apikey",
      "appkey",
    );
    expect(updateMonitor as unknown as jest.Mock).toHaveBeenCalledWith(
      "datadoghq.com",
      123456,
      UPDATED_CUSTOM_MONITOR_2_PARAMS,
      "apikey",
      "appkey",
    ); //make sure to use the UPDATED_Monitors?
    expect(createMonitor as unknown as jest.Mock).toHaveBeenCalledWith(
      "datadoghq.com",
      TIMEOUT_MONITOR_PARAMS,
      "apikey",
      "appkey",
    );
    expect(deleteMonitor as unknown as jest.Mock).toHaveBeenCalledWith("datadoghq.com", 123456, "apikey", "appkey");
  });
  it("returns 'Succcessfully updated custom_monitor_1, 'Successfully created increased_cost', 'Successfully deleted timeout'", async () => {
    (getRecommendedMonitors as unknown as jest.Mock).mockReturnValue({RECOMMENDED_MONITORS});
    (getExistingMonitors as unknown as jest.Mock).mockReturnValue({
      timeout: 123456,
      custom_monitor_1: 123456,
      custom_monitor_2: 123456,
    });
    (createMonitor as unknown as jest.Mock).mockReturnValue({ status: 200 });
    (updateMonitor as unknown as jest.Mock).mockReturnValue({ status: 200 });
    (deleteMonitor as unknown as jest.Mock).mockReturnValue({ status: 200 });
    const logStatements = await setMonitors(
      "app",
      "datadoghq.com",
      MONITOR_SET_3,
      "apikey",
      "appkey",
      "cloud_formation_id",
      "service",
      "env",
    );
    expect(logStatements).toEqual([
      "Successfully updated custom_monitor_1",
      "Successfully created increased_cost",
      "Successfully deleted timeout, custom_monitor_2",
    ]);
    expect(updateMonitor as unknown as jest.Mock).toHaveBeenCalledWith(
      "datadoghq.com",
      123456,
      CUSTOM_MONITOR_1_PARAMS,
      "apikey",
      "appkey",
    );
    expect(deleteMonitor as unknown as jest.Mock).toHaveBeenCalledWith("datadoghq.com", 123456, "apikey", "appkey");
    expect(deleteMonitor as unknown as jest.Mock).toHaveBeenCalledWith("datadoghq.com", 123456, "apikey", "appkey");
    expect(createMonitor as unknown as jest.Mock).toHaveBeenCalledWith(
      "datadoghq.com",
      INCREASED_COST_MONITOR_PARAMS,
      "apikey",
      "appkey",
    );
  });
});
