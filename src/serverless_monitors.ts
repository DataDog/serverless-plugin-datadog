export interface ServerlessMonitor {
  name: string;
  threshold: number;
  query: (cloudFormationStackId: string, criticalThreshold: number) => string;
  message: string;
  type?: string;
}

export const HIGH_ERROR_RATE: ServerlessMonitor = {
  name: "High Error Rate on {{functionname.name}} in {{region.name}} for {{aws_account.name}}",
  threshold: 0.1,
  query: (cloudFormationStackId: string, criticalThreshold: number) => {
    return `avg(last_15m):sum:aws.lambda.errors{aws_cloudformation_stack-id:${cloudFormationStackId}} by {functionname,region,aws_account}.as_count() / sum:aws.lambda.invocations{aws_cloudformation_stack-id:${cloudFormationStackId}} by {functionname,region,aws_account}.as_count() >= ${criticalThreshold}`;
  },
  message:
    "More than 10% of the function’s invocations were errors in the selected time range. {{#is_alert}} Resolution: Examine the function’s logs, check for recent code or configuration changes with [Deployment Tracking](https://docs.datadoghq.com/serverless/deployment_tracking), or look for failures across microservices with [distributed tracing](https://docs.datadoghq.com/serverless/distributed_tracing).{{/is_alert}}",
};

export const TIMEOUT: ServerlessMonitor = {
  name: "Timeout on {{functionname.name}} in {{region.name}} for {{aws_account.name}}",
  threshold: 1,
  query: (cloudFormationStackId: string, criticalThreshold: number) => {
    return `avg(last_15m):sum:aws.lambda.duration.maximum{aws_cloudformation_stack-id:${cloudFormationStackId}} by {aws_account,functionname,region}.as_count() / (sum:aws.lambda.timeout{aws_cloudformation_stack-id:${cloudFormationStackId}} by {aws_account,functionname,region}.as_count() * 1000) >= ${criticalThreshold}`;
  },
  message:
    "At least one invocation in the selected time range timed out. This occurs when your function runs for longer than the configured timeout or the global Lambda timeout. Resolution: [Distributed tracing](https://docs.datadoghq.com/serverless/distributed_tracing) can help you pinpoint slow requests to APIs and other microservices. You can also consider increasing the timeout of your function. Note that this could affect your AWS bill.",
};

export const OUT_OF_MEMORY: ServerlessMonitor = {
  name: "Out of Memory on {{functionname.name}} in {{region.name}} for {{aws_account.name}}",
  threshold: 0,
  query: (cloudFormationStackId: string, criticalThreshold: number) => {
    return `avg(last_15m):sum:aws.lambda.enhanced.out_of_memory{aws_cloudformation_stack-id:${cloudFormationStackId}} by {aws_account,functionname,region} > ${criticalThreshold}`;
  },
  message:
    "At least one invocation in the selected time range ran out of memory. Resolution: Lambda functions that use more than their allotted amount of memory can be killed by the Lambda runtime. To users, this may look like failed requests to your application. [Distributed tracing](https://docs.datadoghq.com/serverless/distributed_tracing) can help you pinpoint parts of your application using excessive amounts of memory. Consider increasing the amount of memory your Lambda function is allowed to use.",
};

export const HIGH_ITERATOR_AGE: ServerlessMonitor = {
  name: "High Iterator Age on {{functionname.name}} in {{region.name}} for {{aws_account.name}}",
  threshold: 86400,
  query: (cloudFormationStackId: string, criticalThreshold: number) => {
    return `avg(last_15m):min:aws.lambda.iterator_age.maximum{aws_cloudformation_stack-id:${cloudFormationStackId}} by {aws_account,region,functionname} >= ${criticalThreshold}`;
  },
  message:
    "The function’s iterator was older than two hours. Iterator age measures the age of the last record for each batch of records processed from a stream. When this value increases, it means your function cannot process data fast enough. {{#is_alert}} Resolution: Enable [distributed tracing](https://docs.datadoghq.com/serverless/distributed_tracing) to isolate why your function has so much data being streamed to it. You can also consider increasing the shard count and batch size of the stream your function reads from. {{/is_alert}}",
};

export const HIGH_COLD_START_RATE: ServerlessMonitor = {
  name: "High Cold Start Rate on {{functionname.name}} in {{region.name}} for {{aws_account.name}}",
  threshold: 0.2,
  query: (cloudFormationStackId: string, criticalThreshold: number) => {
    return `avg(last_15m):sum:aws.lambda.enhanced.invocations{cold_start:true AND aws_cloudformation_stack-id:${cloudFormationStackId}} by {aws_account,functionname,region}.as_count() / sum:aws.lambda.enhanced.invocations{aws_cloudformation_stack-id:${cloudFormationStackId}} by {aws_account,functionname,region}.as_count() >= ${criticalThreshold}`;
  },
  message:
    "More than 1% of the function’s invocations were cold starts in the selected time range. Datadog’s [enhanced metrics](https://docs.datadoghq.com/serverless/enhanced_lambda_metrics) and [distributed tracing](https://docs.datadoghq.com/serverless/distributed_tracing) can help you understand the impact of cold starts on your applications today. {{#is_alert}} Resolution: Cold starts occur when your serverless applications receive sudden increases in traffic, and can occur when the function was previously inactive or when it was receiving a relatively constant number of requests. Users may perceive cold starts as slow response times or lag. To get ahead of cold starts, consider enabling [provisioned concurrency](https://www.datadoghq.com/blog/monitor-aws-lambda-provisioned-concurrency/) on your impacted Lambda functions. Note that this could affect your AWS bill. {{/is_alert}}",
};

export const HIGH_THROTTLES: ServerlessMonitor = {
  name: "High Throttles on {{functionname.name}} in {{region.name}} for {{aws_account.name}}",
  threshold: 0.2,
  query: (cloudFormationStackId: string, criticalThreshold: number) => {
    return `avg(last_15m):sum:aws.lambda.throttles {aws_cloudformation_stack-id:${cloudFormationStackId}} by {aws_account,region,functionname}.as_count() / ( sum:aws.lambda.throttles {aws_cloudformation_stack-id:${cloudFormationStackId}} by {aws_account,region,functionname}.as_count() + sum:aws.lambda.invocations{aws_cloudformation_stack-id:${cloudFormationStackId}} by {aws_account,region,functionname}.as_count() ) >= ${criticalThreshold}`;
  },
  message:
    "More than 10% of invocations in the selected time range were throttled. Throttling occurs when your serverless Lambda applications receive high levels of traffic without adequate [concurrency](https://docs.aws.amazon.com/lambda/latest/dg/configuration-concurrency.html). {{#is_alert}} Resolution: Check your [Lambda concurrency metrics](https://docs.datadoghq.com/integrations/amazon_lambda/#metrics) and confirm if `aws.lambda.concurrent_executions.maximum` is approaching your AWS account concurrency level. If so, consider configuring reserved concurrency, or request a service quota increase from AWS. Note that this may affect your AWS bill. {{/is_alert}}",
};

export const INCREASED_COST: ServerlessMonitor = {
  name: "Increased Cost on {{functionname.name}} in {{region.name}} for {{aws_account.name}}",
  threshold: 0.2,
  query: (cloudFormationStackId: string, criticalThreshold: number) => {
    return `pct_change(avg(last_5m),last_5m):avg:aws.lambda.enhanced.estimated_cost{aws_cloudformation_stack-id:${cloudFormationStackId}} > ${criticalThreshold}`;
  },
  message:
    "This Lambda function’s estimated cost has increased more than 20%. This could be due to increased traffic to this function, or because it is running longer than expected. [Distributed tracing](https://docs.datadoghq.com/serverless/distributed_tracing) can help pinpoint application bottlenecks.",
};

export const SERVERLESS_MONITORS: { [key: string]: ServerlessMonitor } = {
  high_error_rate: HIGH_ERROR_RATE,
  timeout: TIMEOUT,
  out_of_memory: OUT_OF_MEMORY,
  high_iterator_age: HIGH_ITERATOR_AGE,
  high_cold_start_rate: HIGH_COLD_START_RATE,
  high_throttles: HIGH_THROTTLES,
  increased_cost: INCREASED_COST,
};
