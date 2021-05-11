import { createMonitor, deleteMonitor, getExistingMonitors, updateMonitor } from "./monitor-api-requests";
import { Monitor, setMonitors, buildMonitorParams } from "./monitors";

jest.mock("./monitor-api-requests", () => ({
  createMonitor: jest.fn(),
  updateMonitor: jest.fn(),
  deleteMonitor: jest.fn(),
  getExistingMonitors: jest.fn(),
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
      thresholds: { warning: 1, critical: 25 }, // modified critical threshold value
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

const MONITOR_SET_1 = [CUSTOM_MONITOR_1, CUSTOM_MONITOR_2, INCREASED_COST_MONITOR];
const MONITOR_SET_2 = [CUSTOM_MONITOR_1, UPDATED_CUSTOM_MONITOR_2, TIMEOUT_MONITOR];
const MONITOR_SET_3 = [CUSTOM_MONITOR_1, INCREASED_COST_MONITOR];

describe("buildMonitorParams", () => {
  it("returns valid monitor params for a custom monitor", async () => {
    const monitorParams = buildMonitorParams(CUSTOM_MONITOR_1, "cloud_formation_id", "service", "env");
    expect(monitorParams).toEqual(CUSTOM_MONITOR_1_PARAMS);
  });
  it("returns valid monitor params for a custom monitor", async () => {
    const monitorParams = buildMonitorParams(CUSTOM_MONITOR_2, "cloud_formation_id", "service", "env");
    expect(monitorParams).toEqual(CUSTOM_MONITOR_2_PARAMS);
  });
  it("returns valid monitor params for an updated custom monitor", async () => {
    const monitorParams = buildMonitorParams(UPDATED_CUSTOM_MONITOR_2, "cloud_formation_id", "service", "env");
    expect(monitorParams).toEqual(UPDATED_CUSTOM_MONITOR_2_PARAMS);
  });
  it("returns valid monitor params for Increased Cost monitor", async () => {
    const monitorParams = buildMonitorParams(INCREASED_COST_MONITOR, "cloud_formation_id", "service", "env");
    expect(monitorParams).toEqual(INCREASED_COST_MONITOR_PARAMS);
  });
  it("returns valid monitor params for the Timeout monitor", async () => {
    const monitorParams = buildMonitorParams(TIMEOUT_MONITOR, "cloud_formation_id", "service", "env");
    expect(monitorParams).toEqual(TIMEOUT_MONITOR_PARAMS);
  });
});

describe("setMonitors", () => {
  afterEach(() => {
    ((createMonitor as unknown) as jest.Mock).mockRestore();
    ((updateMonitor as unknown) as jest.Mock).mockRestore();
    ((deleteMonitor as unknown) as jest.Mock).mockRestore();
    ((getExistingMonitors as unknown) as jest.Mock).mockRestore();
  });
  it("returns 'Successfully created custom_monitor_1'", async () => {
    ((getExistingMonitors as unknown) as jest.Mock).mockReturnValue({});
    ((createMonitor as unknown) as jest.Mock).mockReturnValue({ status: 200 });
    const logStatements = await setMonitors(
      [CUSTOM_MONITOR_1],
      "apikey",
      "appkey",
      "cloud_formation_id",
      "service",
      "env",
    );
    expect(logStatements).toEqual(["Successfully created custom_monitor_1"]);
    expect((createMonitor as unknown) as jest.Mock).toHaveBeenCalledWith(
      "custom_monitor_1",
      CUSTOM_MONITOR_1_PARAMS,
      "apikey",
      "appkey",
    );
  });
  it("returns 'Successfully updated custom_monitor_1', 'Successfully created custom_monitor_2, increased_cost'", async () => {
    ((getExistingMonitors as unknown) as jest.Mock).mockReturnValue({ custom_monitor_1: 123456 });
    ((createMonitor as unknown) as jest.Mock).mockReturnValue({ status: 200 });
    ((updateMonitor as unknown) as jest.Mock).mockReturnValue({ status: 200 });
    const logStatements = await setMonitors(MONITOR_SET_1, "apikey", "appkey", "cloud_formation_id", "service", "env");
    expect(logStatements).toEqual([
      "Successfully updated custom_monitor_1",
      "Successfully created custom_monitor_2, increased_cost",
    ]);
    expect((createMonitor as unknown) as jest.Mock).toHaveBeenCalledWith(
      "increased_cost",
      INCREASED_COST_MONITOR_PARAMS,
      "apikey",
      "appkey",
    );
    expect((createMonitor as unknown) as jest.Mock).toHaveBeenCalledWith(
      "custom_monitor_2",
      CUSTOM_MONITOR_2_PARAMS,
      "apikey",
      "appkey",
    );
  });
  it("returns 'Successfully updated custom_monitor_1, custom_monitor_2', 'Successfully created timeout', 'Successfully deleted increased_cost'", async () => {
    ((getExistingMonitors as unknown) as jest.Mock).mockReturnValue({
      custom_monitor_1: 123456,
      custom_monitor_2: 123456,
      increased_cost: 123456,
    });
    ((createMonitor as unknown) as jest.Mock).mockReturnValue({ status: 200 });
    ((updateMonitor as unknown) as jest.Mock).mockReturnValue({ status: 200 });
    ((deleteMonitor as unknown) as jest.Mock).mockReturnValue({ status: 200 });
    const logStatements = await setMonitors(MONITOR_SET_2, "apikey", "appkey", "cloud_formation_id", "service", "env");
    expect(logStatements).toEqual([
      "Successfully updated custom_monitor_1, custom_monitor_2",
      "Successfully created timeout",
      "Successfully deleted increased_cost",
    ]);
    expect((updateMonitor as unknown) as jest.Mock).toHaveBeenCalledWith(
      123456,
      "custom_monitor_1",
      CUSTOM_MONITOR_1_PARAMS,
      "apikey",
      "appkey",
    );
    expect((updateMonitor as unknown) as jest.Mock).toHaveBeenCalledWith(
      123456,
      "custom_monitor_2",
      UPDATED_CUSTOM_MONITOR_2_PARAMS,
      "apikey",
      "appkey",
    ); //make sure to use the UPDATED_Monitors?
    expect((createMonitor as unknown) as jest.Mock).toHaveBeenCalledWith(
      "timeout",
      TIMEOUT_MONITOR_PARAMS,
      "apikey",
      "appkey",
    );
    expect((deleteMonitor as unknown) as jest.Mock).toHaveBeenCalledWith(123456, "increased_cost", "apikey", "appkey");
  });
  it("returns 'Succcessfully updated custom_monitor_1, 'Successfully created increased_cost', 'Successfully deleted timeout'", async () => {
    ((getExistingMonitors as unknown) as jest.Mock).mockReturnValue({
      timeout: 123456,
      custom_monitor_1: 123456,
      custom_monitor_2: 123456,
    });
    ((createMonitor as unknown) as jest.Mock).mockReturnValue({ status: 200 });
    ((updateMonitor as unknown) as jest.Mock).mockReturnValue({ status: 200 });
    ((deleteMonitor as unknown) as jest.Mock).mockReturnValue({ status: 200 });
    const logStatements = await setMonitors(MONITOR_SET_3, "apikey", "appkey", "cloud_formation_id", "service", "env");
    expect(logStatements).toEqual([
      "Successfully updated custom_monitor_1",
      "Successfully created increased_cost",
      "Successfully deleted timeout, custom_monitor_2",
    ]);
    expect((updateMonitor as unknown) as jest.Mock).toHaveBeenCalledWith(
      123456,
      "custom_monitor_1",
      CUSTOM_MONITOR_1_PARAMS,
      "apikey",
      "appkey",
    );
    expect((deleteMonitor as unknown) as jest.Mock).toHaveBeenCalledWith(
      123456,
      "custom_monitor_2",
      "apikey",
      "appkey",
    );
    expect((deleteMonitor as unknown) as jest.Mock).toHaveBeenCalledWith(123456, "timeout", "apikey", "appkey");
    expect((createMonitor as unknown) as jest.Mock).toHaveBeenCalledWith(
      "increased_cost",
      INCREASED_COST_MONITOR_PARAMS,
      "apikey",
      "appkey",
    );
  });
});
