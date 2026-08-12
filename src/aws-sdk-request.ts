import type { CloudFormationClient } from "@aws-sdk/client-cloudformation";
import type { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import type { LambdaClient } from "@aws-sdk/client-lambda";
import Aws from "serverless/plugins/aws/provider/awsProvider";

/**
 * osls v4 removed the AWS SDK v2 surface from the AWS provider: calling
 * `provider.request()`, `provider.sdk` or `provider.getCredentials()` now throws
 * an error with code `AWS_SDK_V2_SURFACE_REMOVED`. Instead osls v4 exposes
 * `provider.getAwsSdkV3Config()`, which returns osls-resolved client
 * configuration (region, credentials, retry/proxy/CA settings) so plugins can
 * build their own AWS SDK v3 clients.
 *
 * The Serverless Framework (1.x–4.x) still supports `provider.request()` and
 * does not expose `getAwsSdkV3Config()`. To stay compatible with both we detect
 * `getAwsSdkV3Config()` at runtime: when present (osls v4) we construct an AWS
 * SDK v3 client, otherwise we fall back to the still-supported
 * `provider.request()`. The SDK v3 client packages are loaded lazily so they
 * are only required when the osls v4 code path actually runs.
 *
 * See https://github.com/oss-serverless/osls/blob/4.x/docs/guides/upgrading-to-v4.md#aws-sdk-v2-removed-plugin-authors
 */

interface AwsSdkV3ClientConfig {
  region?: string;
  [key: string]: unknown;
}

// `getAwsSdkV3Config` is not part of @types/serverless yet, so extend the type.
type AwsProviderWithSdkV3 = Aws & {
  getAwsSdkV3Config(options?: { region?: string }): Promise<AwsSdkV3ClientConfig>;
};

function supportsAwsSdkV3(aws: Aws): aws is AwsProviderWithSdkV3 {
  return typeof (aws as Partial<AwsProviderWithSdkV3>).getAwsSdkV3Config === "function";
}

interface AwsSdkV3Clients {
  lambda: Map<string, Promise<LambdaClient>>;
  cloudWatchLogs: Map<string, Promise<CloudWatchLogsClient>>;
  cloudFormation: Map<string, Promise<CloudFormationClient>>;
}

const sdkV3Clients = new WeakMap<Aws, AwsSdkV3Clients>();

function getSdkV3Clients(aws: Aws): AwsSdkV3Clients {
  let clients = sdkV3Clients.get(aws);
  if (clients === undefined) {
    clients = {
      lambda: new Map(),
      cloudWatchLogs: new Map(),
      cloudFormation: new Map(),
    };
    sdkV3Clients.set(aws, clients);
  }
  return clients;
}

function getSdkV3Client<T>(
  clients: Map<string, Promise<T>>,
  region: string | undefined,
  create: () => Promise<T>,
): Promise<T> {
  const key = region ?? "default";
  const cachedClient = clients.get(key);
  if (cachedClient !== undefined) {
    return cachedClient;
  }

  const client = create().catch((error) => {
    clients.delete(key);
    throw error;
  });
  clients.set(key, client);
  return client;
}

/** Calls Lambda GetFunction. Rejects if the function does not exist. */
export async function lambdaGetFunction(aws: Aws, functionName: string): Promise<void> {
  if (supportsAwsSdkV3(aws)) {
    const lambda = await import("@aws-sdk/client-lambda");
    const region = aws.getRegion();
    const client = await getSdkV3Client(getSdkV3Clients(aws).lambda, region, async () => {
      return new lambda.LambdaClient(await aws.getAwsSdkV3Config({ region }));
    });
    await client.send(new lambda.GetFunctionCommand({ FunctionName: functionName }));
    return;
  }
  await aws.request("Lambda", "getFunction", { FunctionName: functionName });
}

/** Calls CloudWatchLogs DescribeSubscriptionFilters for a log group. */
export async function cloudWatchLogsDescribeSubscriptionFilters(aws: Aws, logGroupName: string): Promise<any[]> {
  if (supportsAwsSdkV3(aws)) {
    const cloudWatchLogs = await import("@aws-sdk/client-cloudwatch-logs");
    const region = aws.getRegion();
    const client = await getSdkV3Client(getSdkV3Clients(aws).cloudWatchLogs, region, async () => {
      return new cloudWatchLogs.CloudWatchLogsClient(await aws.getAwsSdkV3Config({ region }));
    });
    const output = await client.send(new cloudWatchLogs.DescribeSubscriptionFiltersCommand({ logGroupName }));
    return output.subscriptionFilters ?? [];
  }
  const result = await aws.request("CloudWatchLogs", "describeSubscriptionFilters", { logGroupName });
  return result.subscriptionFilters;
}

/** Calls CloudFormation DescribeStacks for a stack in the given region. */
export async function cloudFormationDescribeStacks(aws: Aws, stackName: string, region: string): Promise<any> {
  if (supportsAwsSdkV3(aws)) {
    const cloudFormation = await import("@aws-sdk/client-cloudformation");
    const client = await getSdkV3Client(getSdkV3Clients(aws).cloudFormation, region, async () => {
      return new cloudFormation.CloudFormationClient(await aws.getAwsSdkV3Config({ region }));
    });
    return client.send(new cloudFormation.DescribeStacksCommand({ StackName: stackName }));
  }
  return aws.request("CloudFormation", "describeStacks", { StackName: stackName }, { region });
}
