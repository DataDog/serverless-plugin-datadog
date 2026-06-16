import child_process from 'node:child_process';

// Runner-agnostic: no jest/vitest imports here so the same helpers can back any
// test runner. Mirrors the datadog-ci reference helper (e2e/helpers/exec.ts).

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ExecOptions {
  env?: Record<string, string | undefined>;
  // Serverless / AWS calls can run long; default generous but bounded.
  cwd?: string;
  maxBuffer?: number;
}

export const execPromise = async (command: string, options: ExecOptions = {}): Promise<ExecResult> => {
  const {env, cwd, maxBuffer = 50 * 1024 * 1024} = options;

  return new Promise((resolve) => {
    child_process.exec(command, {env: {...process.env, ...env}, cwd, maxBuffer}, (error, stdout, stderr) => {
      resolve({
        exitCode: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
  });
};

// Transient cloud-provider errors that are safe to retry. "Retry the cloud, not
// the assertions" -- these are throttling/timeout/conflict signals, never real
// failures. AWS-specific patterns are added on top of the shared cross-cloud set.
const RETRYABLE_PATTERNS = [
  // Generic / cross-cloud
  'GatewayTimeout',
  'Operation was canceled',
  'ETIMEDOUT',
  'ECONNRESET',
  'temporarily unavailable',
  // AWS Lambda / CloudFormation / STS
  'ThrottlingException',
  'TooManyRequestsException',
  'Rate exceeded',
  'RequestLimitExceeded',
  'ResourceConflictException',
  'ServiceException',
  'InternalFailure',
  'ServiceUnavailable',
  'is in progress', // CloudFormation stack op already running
  'ProvisionedConcurrencyConfig', // eventual-consistency churn on update
];

const isRetryable = (result: ExecResult): boolean => {
  const output = `${result.stdout} ${result.stderr}`;

  return RETRYABLE_PATTERNS.some((pattern) => output.includes(pattern));
};

const waitFor = (seconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, seconds * 1000));

export const execPromiseWithRetries = async (
  command: string,
  options: ExecOptions = {},
  {maxAttempts = 3, delaySeconds = 10}: {maxAttempts?: number; delaySeconds?: number} = {},
): Promise<ExecResult> => {
  let result: ExecResult = {exitCode: 1, stdout: '', stderr: 'not run'};
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    result = await execPromise(command, options);
    if (result.exitCode === 0) {
      return result;
    }
    if (attempt < maxAttempts && isRetryable(result)) {
      // eslint-disable-next-line no-console
      console.log(`Command failed with retryable error (attempt ${attempt}/${maxAttempts}), retrying in ${delaySeconds}s...`);
      // eslint-disable-next-line no-console
      console.log(`stdout: ${result.stdout}`);
      // eslint-disable-next-line no-console
      console.log(`stderr: ${result.stderr}`);
      await waitFor(delaySeconds);
    } else {
      return result;
    }
  }

  return result;
};
