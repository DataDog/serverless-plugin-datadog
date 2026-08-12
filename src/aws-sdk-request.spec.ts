import type { Mock } from "vitest";
import Aws from "serverless/plugins/aws/provider/awsProvider";
import {
  cloudFormationDescribeStacks,
  cloudWatchLogsDescribeSubscriptionFilters,
  lambdaGetFunction,
} from "./aws-sdk-request";

const lambdaSend = vi.fn();
const logsSend = vi.fn();
const cfnSend = vi.fn();

const LambdaClient = vi.fn().mockImplementation(function () {
  return { send: lambdaSend };
});
const CloudWatchLogsClient = vi.fn().mockImplementation(function () {
  return { send: logsSend };
});
const CloudFormationClient = vi.fn().mockImplementation(function () {
  return { send: cfnSend };
});

vi.mock("@aws-sdk/client-lambda", () => ({
  LambdaClient,
  GetFunctionCommand: vi.fn().mockImplementation(function (input) {
    return { input };
  }),
}));
vi.mock("@aws-sdk/client-cloudwatch-logs", () => ({
  CloudWatchLogsClient,
  DescribeSubscriptionFiltersCommand: vi.fn().mockImplementation(function (input) {
    return { input };
  }),
}));
vi.mock("@aws-sdk/client-cloudformation", () => ({
  CloudFormationClient,
  DescribeStacksCommand: vi.fn().mockImplementation(function (input) {
    return { input };
  }),
}));

/** Serverless Framework style provider: exposes request(), no getAwsSdkV3Config(). */
function legacyAwsMock(requestImpl: Mock): Aws {
  return { request: requestImpl } as unknown as Aws;
}

type AwsV3Mock = Aws & {
  getAwsSdkV3Config: Mock;
  getRegion: Mock;
};

/** osls v4 style provider: exposes getAwsSdkV3Config(), request() throws. */
function oslsV4AwsMock(config: Record<string, unknown> = { region: "us-east-1" }): AwsV3Mock {
  return {
    getAwsSdkV3Config: vi.fn().mockResolvedValue(config),
    getRegion: vi.fn().mockReturnValue(config.region),
    request: vi.fn().mockRejectedValue(new Error("AWS_SDK_V2_SURFACE_REMOVED")),
  } as unknown as AwsV3Mock;
}

describe("aws-sdk-request dual path", () => {
  describe("Serverless Framework (legacy provider.request path)", () => {
    it("lambdaGetFunction calls provider.request", async () => {
      const request = vi.fn().mockResolvedValue(undefined);
      await lambdaGetFunction(legacyAwsMock(request), "my-forwarder");
      expect(request).toHaveBeenCalledWith("Lambda", "getFunction", { FunctionName: "my-forwarder" });
      expect(LambdaClient).not.toHaveBeenCalled();
    });

    it("cloudWatchLogsDescribeSubscriptionFilters returns filters from provider.request", async () => {
      const filters = [{ filterName: "dd" }];
      const request = vi.fn().mockResolvedValue({ subscriptionFilters: filters });
      const result = await cloudWatchLogsDescribeSubscriptionFilters(legacyAwsMock(request), "/aws/lambda/foo");
      expect(request).toHaveBeenCalledWith("CloudWatchLogs", "describeSubscriptionFilters", {
        logGroupName: "/aws/lambda/foo",
      });
      expect(result).toBe(filters);
    });

    it("cloudFormationDescribeStacks calls provider.request with region option", async () => {
      const output = { Stacks: [{ StackId: "abc" }] };
      const request = vi.fn().mockResolvedValue(output);
      const result = await cloudFormationDescribeStacks(legacyAwsMock(request), "my-stack", "eu-west-1");
      expect(request).toHaveBeenCalledWith(
        "CloudFormation",
        "describeStacks",
        { StackName: "my-stack" },
        { region: "eu-west-1" },
      );
      expect(result).toBe(output);
    });
  });

  describe("osls v4 (AWS SDK v3 client path)", () => {
    it("shares a Lambda client while it is being created", async () => {
      lambdaSend.mockResolvedValue({});
      const aws = oslsV4AwsMock();

      await Promise.all([lambdaGetFunction(aws, "my-forwarder"), lambdaGetFunction(aws, "another-forwarder")]);

      expect(aws.getAwsSdkV3Config).toHaveBeenCalledTimes(1);
      expect(aws.getAwsSdkV3Config).toHaveBeenCalledWith({ region: "us-east-1" });
      expect(LambdaClient).toHaveBeenCalledTimes(1);
      expect(LambdaClient).toHaveBeenCalledWith({ region: "us-east-1" });
      expect(lambdaSend).toHaveBeenCalledWith(expect.objectContaining({ input: { FunctionName: "my-forwarder" } }));
      expect(lambdaSend).toHaveBeenCalledWith(
        expect.objectContaining({ input: { FunctionName: "another-forwarder" } }),
      );
    });

    it("uses separate Lambda clients for separate providers", async () => {
      lambdaSend.mockResolvedValue({});
      await lambdaGetFunction(oslsV4AwsMock(), "my-forwarder");
      await lambdaGetFunction(oslsV4AwsMock(), "my-forwarder");

      expect(LambdaClient).toHaveBeenCalledTimes(2);
    });

    it("retries client creation after a shared config error", async () => {
      lambdaSend.mockResolvedValue({});
      const aws = oslsV4AwsMock();
      let rejectConfig: (reason: Error) => void;
      const failedConfig = new Promise<Record<string, unknown>>((_, reject) => {
        rejectConfig = reject;
      });
      aws.getAwsSdkV3Config.mockReturnValueOnce(failedConfig);

      const calls = [lambdaGetFunction(aws, "my-forwarder"), lambdaGetFunction(aws, "another-forwarder")];
      rejectConfig!(new Error("temporary failure"));
      await expect(Promise.all(calls)).rejects.toThrow("temporary failure");
      await lambdaGetFunction(aws, "my-forwarder");

      expect(aws.getAwsSdkV3Config).toHaveBeenCalledTimes(2);
      expect(LambdaClient).toHaveBeenCalledTimes(1);
    });

    it("cloudWatchLogsDescribeSubscriptionFilters returns [] when SDK response omits filters", async () => {
      logsSend.mockResolvedValue({});
      const aws = oslsV4AwsMock();
      const result = await cloudWatchLogsDescribeSubscriptionFilters(aws, "/aws/lambda/foo");

      expect(aws.getAwsSdkV3Config).toHaveBeenCalledWith({ region: "us-east-1" });
      expect(CloudWatchLogsClient).toHaveBeenCalledWith({ region: "us-east-1" });
      expect(logsSend).toHaveBeenCalledWith({ input: { logGroupName: "/aws/lambda/foo" } });
      expect(result).toEqual([]);
    });

    it("uses separate CloudFormation clients for each region", async () => {
      cfnSend.mockResolvedValue({ Stacks: [{ StackId: "abc" }] });
      const aws = oslsV4AwsMock();
      aws.getAwsSdkV3Config.mockImplementation(async ({ region } = {}) => ({ region }));

      await cloudFormationDescribeStacks(aws, "my-stack", "eu-west-1");
      await cloudFormationDescribeStacks(aws, "another-stack", "eu-west-1");
      const result = await cloudFormationDescribeStacks(aws, "my-stack", "us-east-1");

      expect(aws.getAwsSdkV3Config).toHaveBeenCalledTimes(2);
      expect(aws.getAwsSdkV3Config).toHaveBeenNthCalledWith(1, { region: "eu-west-1" });
      expect(aws.getAwsSdkV3Config).toHaveBeenNthCalledWith(2, { region: "us-east-1" });
      expect(CloudFormationClient).toHaveBeenNthCalledWith(1, { region: "eu-west-1" });
      expect(CloudFormationClient).toHaveBeenNthCalledWith(2, { region: "us-east-1" });
      expect(result).toEqual({ Stacks: [{ StackId: "abc" }] });
    });
  });
});
