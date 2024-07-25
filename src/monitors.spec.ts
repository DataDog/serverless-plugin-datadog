import {
  createMonitor,
  deleteMonitor,
  getExistingMonitors,
  updateMonitor,
  getRecommendedMonitors,
} from "./monitor-api-requests";
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
    name: "Updated Custom Monitor 2",
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

const DEFAULT_TIMEOUT_MONITOR: Monitor = {
  timeout: {},
};

const NO_TEMPLATE_VARIABLE_MONITOR: Monitor = {
  test_no_template_variable: {},
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
  name: "Updated Custom Monitor 2",
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
const NO_TEMPLATE_VARIABLE_MONITOR_PARAMS = {
  name: "This is to ensure that serverless plugin works properly when a recommended monitor has no template variable",
  query: "false",
  tags: [
    "serverless_monitor_type:single_function",
    "serverless_monitor_id:test_no_template_variable",
    "aws_cloudformation_stack-id:cloud_formation_id",
    "created_by:dd_sls_plugin",
    "env:env",
    "service:service",
  ],
  options: {},
  type: "metric alert",
  message: "This alert is not supposed to be triggered.",
};
const DEFAULT_TIMEOUT_MONITOR_PARAMS = {
  name: "Timeout on {{functionname.name}} in {{region.name}} for {{aws_account.name}} with $varNoDefault",
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

const TEMPLATE_VARIABLES = [
  {
    name: "functionName",
    defaults: ["{{functionname.name}}"],
    prefix: "",
    available_values: [],
  },
  {
    name: "regionName",
    defaults: ["{{region.name}}"],
    prefix: "",
    available_values: [],
  },
  {
    name: "awsAccount",
    defaults: ["{{aws_account.name}}"],
    prefix: "",
    available_values: [],
  },
  {
    name: "scope",
    defaults: ["*"],
    prefix: "",
    available_values: [],
  },
  // A template variable with no default value. If it exists in the name of
  // a recommended monitor, then interpolation code will do nothing, i.e.
  // it will leave "$varNoDefault" as it is in the name string.
  {
    name: "varNoDefault",
    defaults: [],
    prefix: "",
    available_values: [],
  },
];

const RECOMMENDED_MONITORS: RecommendedMonitors = {
  increased_cost: {
    name: "Increased Cost on $functionName in $regionName for $awsAccount",
    threshold: 0.2,
    message: "Estimated cost of invocations have increased more than 20%",
    query: (cloudFormationStackId: string, criticalThreshold: number) => {
      return `pct_change(avg(last_5m),last_5m):avg:aws.lambda.enhanced.estimated_cost{aws_cloudformation_stack-id:${cloudFormationStackId}} > ${criticalThreshold}`;
    },
    templateVariables: TEMPLATE_VARIABLES,
  },
  timeout: {
    name: "Timeout on $functionName in $regionName for $awsAccount with $varNoDefault",
    threshold: 1,
    message:
      "At least one invocation in the selected time range timed out. This occurs when your function runs for longer than the configured timeout or the global Lambda timeout. Resolution: [Distributed tracing](https://docs.datadoghq.com/serverless/distributed_tracing) can help you pinpoint slow requests to APIs and other microservices. You can also consider increasing the timeout of your function. Note that this could affect your AWS bill.",
    type: "query alert",
    query: (cloudFormationStackId: string, criticalThreshold: number) => {
      return `avg(last_15m):sum:aws.lambda.duration.maximum{aws_cloudformation_stack-id:${cloudFormationStackId}} by {aws_account,functionname,region}.as_count() / (sum:aws.lambda.timeout{aws_cloudformation_stack-id:${cloudFormationStackId}} by {aws_account,functionname,region}.as_count() * 1000) >= ${criticalThreshold}`;
    },
    templateVariables: TEMPLATE_VARIABLES,
  },
  test_no_template_variable: {
    name: "This is to ensure that serverless plugin works properly when a recommended monitor has no template variable",
    threshold: 0,
    message: "This alert is not supposed to be triggered.",
    query: () => {
      return "false";
    },
  },
};

const MONITOR_SET_1 = [CUSTOM_MONITOR_1, CUSTOM_MONITOR_2, INCREASED_COST_MONITOR];
const MONITOR_SET_2 = [CUSTOM_MONITOR_1, UPDATED_CUSTOM_MONITOR_2, TIMEOUT_MONITOR];
const MONITOR_SET_3 = [CUSTOM_MONITOR_1, INCREASED_COST_MONITOR];

describe("buildMonitorParams", () => {
  it("returns valid monitor params for a custom monitor", async () => {
    const monitorParams = buildMonitorParams(
      CUSTOM_MONITOR_1,
      "cloud_formation_id",
      "service",
      "env",
      RECOMMENDED_MONITORS,
    );
    expect(monitorParams).toEqual(CUSTOM_MONITOR_1_PARAMS);
  });
  it("returns valid monitor params for a custom monitor", async () => {
    const monitorParams = buildMonitorParams(
      CUSTOM_MONITOR_2,
      "cloud_formation_id",
      "service",
      "env",
      RECOMMENDED_MONITORS,
    );
    expect(monitorParams).toEqual(CUSTOM_MONITOR_2_PARAMS);
  });
  it("returns valid monitor params for an updated custom monitor", async () => {
    const monitorParams = buildMonitorParams(
      UPDATED_CUSTOM_MONITOR_2,
      "cloud_formation_id",
      "service",
      "env",
      RECOMMENDED_MONITORS,
    );
    expect(monitorParams).toEqual(UPDATED_CUSTOM_MONITOR_2_PARAMS);
  });
  it("returns valid monitor params for Increased Cost monitor", async () => {});
  it("returns valid monitor params for the Timeout monitor", async () => {
    const monitorParams = buildMonitorParams(
      TIMEOUT_MONITOR,
      "cloud_formation_id",
      "service",
      "env",
      RECOMMENDED_MONITORS,
    );
    expect(monitorParams).toEqual(TIMEOUT_MONITOR_PARAMS);
  });
  it("returns valid monitor params for a minotor which has no template variable", async () => {
    const monitorParams = buildMonitorParams(
      NO_TEMPLATE_VARIABLE_MONITOR,
      "cloud_formation_id",
      "service",
      "env",
      RECOMMENDED_MONITORS,
    );
    expect(monitorParams).toEqual(NO_TEMPLATE_VARIABLE_MONITOR_PARAMS);
  });
  it("interpolates template variables in the name of a recommended monitor", async () => {
    const monitorParams = buildMonitorParams(
      DEFAULT_TIMEOUT_MONITOR,
      "cloud_formation_id",
      "service",
      "env",
      RECOMMENDED_MONITORS,
    );
    expect(monitorParams).toEqual(DEFAULT_TIMEOUT_MONITOR_PARAMS);
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

  it("returns 'Successfully created custom_monitor_1'", async () => {
    (getRecommendedMonitors as unknown as jest.Mock).mockReturnValue(RECOMMENDED_MONITORS);
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
    (getRecommendedMonitors as unknown as jest.Mock).mockReturnValue(RECOMMENDED_MONITORS);
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
    (getRecommendedMonitors as unknown as jest.Mock).mockReturnValue(RECOMMENDED_MONITORS);
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
    (getRecommendedMonitors as unknown as jest.Mock).mockReturnValue(RECOMMENDED_MONITORS);
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
