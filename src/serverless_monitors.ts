export interface ServerlessMonitor {
  name: string;
  query: string;
  threshold: number;
  message?: string;
}

export const HIGH_ERROR_RATE: ServerlessMonitor = {
  name: "High Error Rate",
  query:
    "avg(last_15m):sum:aws.lambda.errors{*} by {functionname,region,aws_account}.as_count() / sum:aws.lambda.invocations{*} by {functionname,region,aws_account}.as_count() >= 0.1",
  threshold: 0.1,
  message: "Copy placeholder"
};

export const TIMEOUT: ServerlessMonitor = {
  name: "Timeout",
  query:
    "avg(last_15m):sum:aws.lambda.duration.maximum{*} by {aws_account,functionname,region}.as_count() / (sum:aws.lambda.timeout{*} by {aws_account,functionname,region}.as_count() * 1000) >= 1",
  threshold: 1,
  message: "Copy placeholder"
};
export const OUT_OF_MEMORY: ServerlessMonitor = {
  name: "Out of Memory",
  query:
    "avg(last_15m):sum:aws.lambda.enhanced.max_memory_used{*} by {aws_account,functionname,region}.as_count() / sum:aws.lambda.memorysize{*} by {aws_account,functionname,region}.as_count() >= 1",
  threshold: 1,
  message: "Copy placeholder"
};
export const HIGH_ITERATOR_AGE: ServerlessMonitor = {
  name: "High Iterator Age",
  query: "avg(last_15m):min:aws.lambda.iterator_age.maximum{*} by {aws_account,region,functionname} >= 86400",
  threshold: 86400,
  message: "Copy placeholder"
};
export const HIGH_COLD_START_RATE: ServerlessMonitor = {
  name: "High Cold Start Rate",
  query:
    "avg(last_15m):sum:aws.lambda.enhanced.invocations{cold_start:true} by {aws_account,functionname,region}.as_count() / sum:aws.lambda.enhanced.invocations{*} by {aws_account,functionname,region}.as_count() >= 0.2",
  threshold: 0.2,
  message: "Copy placeholder"
};
export const HIGH_THROTTLES: ServerlessMonitor = {
  name: "High Throttles",
  query:
    "avg(last_15m):sum:aws.lambda.throttles{*} by {aws_account,region,functionname}.as_count() / sum:aws.lambda.invocations{*} by {aws_account,region,functionname}.as_count() >= 0.2",
  threshold: 0.2,
  message: "Copy placeholder"
};

export const SERVERLESS_MONITORS: { [key: string]: ServerlessMonitor } = {
  "high_error_rate": HIGH_ERROR_RATE,
  "timeout": TIMEOUT,
  "out_of_memory": OUT_OF_MEMORY,
  "high_iterator_age": HIGH_ITERATOR_AGE,
  "high_cold_start_rate": HIGH_COLD_START_RATE,
  "high_throttles": HIGH_THROTTLES
};
