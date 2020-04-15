export enum TracingMode {
  XRAY,
  DD_TRACE,
  HYBRID,
  NONE,
}
export function optionsTemplate(mode: TracingMode): string {
  switch (mode) {
    case TracingMode.HYBRID:
      return "{ mergeDatadogXrayTraces: true }";
    case TracingMode.DD_TRACE:
    case TracingMode.XRAY:
    case TracingMode.NONE:
      return "{}";
  }
}
