import Aws from "serverless/plugins/aws/provider/awsProvider";
import {
  cloudFormationDescribeStacks,
  cloudWatchLogsDescribeSubscriptionFilters,
  lambdaGetFunction,
} from "./aws-sdk-request";

const lambdaSend = jest.fn();
const logsSend = jest.fn();
const cfnSend = jest.fn();

const LambdaClient = jest.fn().mockImplementation(() => ({ send: lambdaSend }));
const CloudWatchLogsClient = jest.fn().mockImplementation(() => ({ send: logsSend }));
const CloudFormationClient = jest.fn().mockImplementation(() => ({ send: cfnSend }));

jest.mock("@aws-sdk/client-lambda", () => ({
  LambdaClient,
  GetFunctionCommand: jest.fn().mockImplementation((input) => ({ input })),
}));
jest.mock("@aws-sdk/client-cloudwatch-logs", () => ({
  CloudWatchLogsClient,
  DescribeSubscriptionFiltersCommand: jest.fn().mockImplementation((input) => ({ input })),
}));
jest.mock("@aws-sdk/client-cloudformation", () => ({
  CloudFormationClient,
  DescribeStacksCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

/** Serverless Framework style provider: exposes request(), no getAwsSdkV3Config(). */
function legacyAwsMock(requestImpl: jest.Mock): Aws {
  return { request: requestImpl } as unknown as Aws;
}

/** osls v4 style provider: exposes getAwsSdkV3Config(), request() throws. */
function oslsV4AwsMock(config: Record<string, unknown> = { region: "us-east-1" }): Aws {
  return {
    getAwsSdkV3Config: jest.fn().mockResolvedValue(config),
    request: jest.fn().mockRejectedValue(new Error("AWS_SDK_V2_SURFACE_REMOVED")),
  } as unknown as Aws;
}

describe("aws-sdk-request dual path", () => {
  describe("Serverless Framework (legacy provider.request path)", () => {
    it("lambdaGetFunction calls provider.request", async () => {
      const request = jest.fn().mockResolvedValue(undefined);
      await lambdaGetFunction(legacyAwsMock(request), "my-forwarder");
      expect(request).toHaveBeenCalledWith("Lambda", "getFunction", { FunctionName: "my-forwarder" });
      expect(LambdaClient).not.toHaveBeenCalled();
    });

    it("cloudWatchLogsDescribeSubscriptionFilters returns filters from provider.request", async () => {
      const filters = [{ filterName: "dd" }];
      const request = jest.fn().mockResolvedValue({ subscriptionFilters: filters });
      const result = await cloudWatchLogsDescribeSubscriptionFilters(legacyAwsMock(request), "/aws/lambda/foo");
      expect(request).toHaveBeenCalledWith("CloudWatchLogs", "describeSubscriptionFilters", {
        logGroupName: "/aws/lambda/foo",
      });
      expect(result).toBe(filters);
    });

    it("cloudFormationDescribeStacks calls provider.request with region option", async () => {
      const output = { Stacks: [{ StackId: "abc" }] };
      const request = jest.fn().mockResolvedValue(output);
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
    it("lambdaGetFunction constructs a LambdaClient and sends GetFunctionCommand", async () => {
      lambdaSend.mockResolvedValue({});
      const aws = oslsV4AwsMock();
      await lambdaGetFunction(aws, "my-forwarder");
      expect((aws as any).getAwsSdkV3Config).toHaveBeenCalled();
      expect(LambdaClient).toHaveBeenCalledWith({ region: "us-east-1" });
      expect(lambdaSend).toHaveBeenCalledWith({ input: { FunctionName: "my-forwarder" } });
    });

    it("cloudWatchLogsDescribeSubscriptionFilters returns [] when SDK response omits filters", async () => {
      logsSend.mockResolvedValue({});
      const result = await cloudWatchLogsDescribeSubscriptionFilters(oslsV4AwsMock(), "/aws/lambda/foo");
      expect(CloudWatchLogsClient).toHaveBeenCalled();
      expect(logsSend).toHaveBeenCalledWith({ input: { logGroupName: "/aws/lambda/foo" } });
      expect(result).toEqual([]);
    });

    it("cloudFormationDescribeStacks passes the region to getAwsSdkV3Config and sends the command", async () => {
      cfnSend.mockResolvedValue({ Stacks: [{ StackId: "abc" }] });
      const aws = oslsV4AwsMock({ region: "eu-west-1" });
      const result = await cloudFormationDescribeStacks(aws, "my-stack", "eu-west-1");
      expect((aws as any).getAwsSdkV3Config).toHaveBeenCalledWith({ region: "eu-west-1" });
      expect(cfnSend).toHaveBeenCalledWith({ input: { StackName: "my-stack" } });
      expect(result).toEqual({ Stacks: [{ StackId: "abc" }] });
    });
  });
});
