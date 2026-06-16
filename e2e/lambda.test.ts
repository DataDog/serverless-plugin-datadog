import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {afterAll, beforeAll, describe, it} from 'vitest';

import {execPromise, execPromiseWithRetries} from './helpers/exec';
import {checkTelemetryFlowing} from './helpers/lambda-telemetry-checker';
import {functionName, functionSnapshot, verifyInstrumented, verifyUninstrumented, type FunctionSnapshot} from './helpers/lambda-verifier';
import {freshnessTimestamp, namePrefix, newRunId} from './helpers/naming';

// Full lifecycle for the serverless-plugin-datadog AWS Lambda instrumentation:
//
//   sls deploy (APPLY: provision + instrument) -> verify CONFIG
//     -> invoke (trigger)                       -> verify TELEMETRY flows
//     -> sls deploy again                        -> assert IDEMPOTENT (no diff)
//     -> sls remove (REMOVE)                     -> verify CLEAN end-state
//     -> teardown (afterAll, always)
//
// For this tool the plugin runs as part of `sls deploy`, so provisioning the
// uninstrumented workload and APPLY coincide -- there is no separately-deployed
// uninstrumented state to instrument later. REMOVE tears down the whole stack,
// so the clean end-state is the function (and all its DD config) being gone.

const e2eDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(e2eDir, 'fixtures', 'lambda-node');

const DEPLOY_TIMEOUT_MS = 900_000;
const TELEMETRY_TIMEOUT_MS = 600_000;
const ENV_VERSION = '1.0.0';
const ENV_NAME = 'e2e';

const describeOrSkip = process.env.SKIP_LAMBDA_TESTS === 'true' ? describe.skip : describe;

describeOrSkip('serverless-plugin-datadog lambda e2e', () => {
  const region = process.env.AWS_REGION ?? 'us-east-1';
  const runId = newRunId();
  const serviceName = namePrefix(runId);
  const apiKey = process.env.DATADOG_API_KEY ?? process.env.DD_API_KEY;
  const appKey = process.env.DATADOG_APP_KEY ?? process.env.DD_APP_KEY;
  const site = process.env.DATADOG_SITE ?? process.env.DD_SITE ?? 'datadoghq.com';

  // Injected into `sls deploy` so serverless.yml stays static. Carries the unique
  // name + freshness stamp (set atomically at creation) and the DD wiring inputs.
  const deployEnv: Record<string, string | undefined> = {
    E2E_SERVICE_NAME: serviceName,
    E2E_CREATED_TS: freshnessTimestamp(),
    AWS_REGION: region,
    DD_API_KEY: apiKey,
    DD_SITE: site,
  };
  const slsOptions = {env: deployEnv, cwd: fixtureDir};

  const deploy = () =>
    execPromiseWithRetries('npx --no-install serverless deploy --stage e2e --conceal', slsOptions, {
      maxAttempts: 2,
      delaySeconds: 20,
    });

  let firstSnapshot: FunctionSnapshot;

  beforeAll(() => {
    assert.ok(apiKey, 'DATADOG_API_KEY (or DD_API_KEY) must be set: used to wire the extension and authenticate the API client');
    assert.ok(appKey, 'DATADOG_APP_KEY (or DD_APP_KEY) must be set: used to poll spans/logs from the Datadog API');
    // eslint-disable-next-line no-console
    console.log(`Run id ${runId} -> service "${serviceName}" in ${region} (site ${site})`);
  });

  afterAll(async () => {
    // Teardown always runs, even if a test above failed mid-lifecycle.
    const result = await execPromise('npx --no-install serverless remove --stage e2e', slsOptions);
    if (result.exitCode !== 0) {
      // eslint-disable-next-line no-console
      console.warn(`Teardown remove returned ${result.exitCode} (ok if already removed): ${result.stderr}`);
    }
  });

  it(
    'deploys and instruments the function',
    async () => {
      const result = await deploy();
      assert.equal(result.exitCode, 0, `sls deploy failed: ${result.stderr || result.stdout}`);

      await verifyInstrumented(serviceName, region);
      firstSnapshot = await functionSnapshot(functionName(serviceName), region);
    },
    DEPLOY_TIMEOUT_MS,
  );

  it(
    'flows traces and logs after invocation',
    async () => {
      const outFile = path.join(os.tmpdir(), `${serviceName}-invoke.json`);
      // A few invocations to give the extension something to flush promptly.
      for (let i = 0; i < 3; i++) {
        const result = await execPromiseWithRetries(
          `aws lambda invoke --function-name "${functionName(serviceName)}" --region "${region}"` +
            ` --payload '{}' --cli-binary-format raw-in-base64-out --output json "${outFile}"`,
        );
        assert.equal(result.exitCode, 0, `lambda invoke failed: ${result.stderr}`);
        const meta = JSON.parse(result.stdout) as {StatusCode?: number; FunctionError?: string};
        assert.equal(meta.StatusCode, 200, `unexpected invoke status: ${result.stdout}`);
        assert.ok(!meta.FunctionError, `invocation errored: ${meta.FunctionError}`);
      }

      await checkTelemetryFlowing({serviceName, env: ENV_NAME, version: ENV_VERSION});
    },
    TELEMETRY_TIMEOUT_MS,
  );

  it(
    're-applies idempotently (no diff, no duplicate)',
    async () => {
      const result = await deploy();
      assert.equal(result.exitCode, 0, `re-deploy failed: ${result.stderr || result.stdout}`);

      // Still instrumented, still no double-wrap / duplicate layers...
      await verifyInstrumented(serviceName, region);
      // ...and byte-for-byte the same instrumentation as the first apply.
      const secondSnapshot = await functionSnapshot(functionName(serviceName), region);
      assert.deepEqual(secondSnapshot, firstSnapshot, 're-apply changed the function config');
    },
    DEPLOY_TIMEOUT_MS,
  );

  it(
    'removes cleanly with no residue',
    async () => {
      const result = await execPromiseWithRetries('npx --no-install serverless remove --stage e2e', slsOptions, {
        maxAttempts: 2,
        delaySeconds: 20,
      });
      assert.equal(result.exitCode, 0, `sls remove failed: ${result.stderr || result.stdout}`);

      await verifyUninstrumented(serviceName, region);
    },
    DEPLOY_TIMEOUT_MS,
  );
});
