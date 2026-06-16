import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

import {execPromise} from './exec';
import {FRESHNESS_TAG_KEY} from './naming';

// Runner-agnostic config verifier: drives the AWS CLI and asserts the deployed
// function's identity with node:assert. "Config present" for Lambda (per spec) =
// DD layers + extension layer + DD_* env vars + tags.

// One canonical runtime for the platform.
export const RUNTIME = 'nodejs20.x';

// The handler the plugin redirects to when wrapping a Node function with layers,
// and the env var that stores the user's original handler. See src/wrapper.ts.
const REDIRECT_HANDLER = '/opt/nodejs/node_modules/datadog-lambda-js/handler.handler';
const ORIGINAL_HANDLER = 'handler.handler';

// DD_* env vars the plugin must wire for a traced + logging Node function with the
// extension. We assert identity on DD_SERVICE/DD_ENV/DD_VERSION, presence on the
// rest. API key wiring is one of several mutually-exclusive forms.
const API_KEY_VARS = ['DD_API_KEY', 'DD_API_KEY_SECRET_ARN', 'DD_KMS_API_KEY', 'DD_API_KEY_SSM_ARN'];
const REQUIRED_PRESENT = ['DD_SITE', 'DD_TRACE_ENABLED', 'DD_SERVERLESS_LOGS_ENABLED'];

// Tag keys. With the extension enabled, the plugin carries service/env/version
// identity as DD_* env vars (asserted below + on telemetry), and tags the function
// with its own version marker only. See src/index.ts: addExtension routes to
// addDDEnvVars (env-var identity), and addTags(shouldAddTags = addExtension !== true)
// applies just the plugin tag.
const TAG_PLUGIN = 'dd_sls_plugin';

interface LambdaLayer {
  Arn: string;
}
interface LambdaConfiguration {
  FunctionArn: string;
  Handler: string;
  Runtime: string;
  Layers?: LambdaLayer[];
  Environment?: {Variables?: Record<string, string>};
}

export interface FunctionSnapshot {
  handler: string;
  layerArns: string[];
  ddEnv: Record<string, string>;
}

// `sls deploy` names functions `<service>-<stage>-<fn>`. Stage is pinned to `e2e`
// and the only function is `hello`.
export const functionName = (serviceName: string): string => `${serviceName}-e2e-hello`;

interface ExpectedLayers {
  node: string;
  extension: string;
}

// Pinned artifact versions come from the plugin's own src/layers.json, so a version
// mismatch blames the plugin/registry, not upstream drift.
export const expectedLayerArns = (region: string): ExpectedLayers => {
  const layersPath = fileURLToPath(new URL('../../src/layers.json', import.meta.url));
  const layers = JSON.parse(fs.readFileSync(layersPath, 'utf-8')) as {
    regions: Record<string, Record<string, string>>;
  };
  const regionLayers = layers.regions[region];
  assert.ok(regionLayers, `region ${region} not present in src/layers.json`);
  const node = regionLayers[RUNTIME];
  const extension = regionLayers.extension;
  assert.ok(node, `no ${RUNTIME} layer pinned for ${region} in src/layers.json`);
  assert.ok(extension, `no extension layer pinned for ${region} in src/layers.json`);

  return {node, extension};
};

const getConfiguration = async (fnName: string, region: string): Promise<LambdaConfiguration> => {
  const result = await execPromise(
    `aws lambda get-function-configuration --function-name "${fnName}" --region "${region}" --output json`,
  );
  assert.equal(result.exitCode, 0, `get-function-configuration failed: ${result.stderr}`);

  return JSON.parse(result.stdout) as LambdaConfiguration;
};

const getTags = async (functionArn: string, region: string): Promise<Record<string, string>> => {
  const result = await execPromise(
    `aws lambda list-tags --resource "${functionArn}" --region "${region}" --output json`,
  );
  assert.equal(result.exitCode, 0, `list-tags failed: ${result.stderr}`);

  return (JSON.parse(result.stdout).Tags ?? {}) as Record<string, string>;
};

// A normalized view used to assert idempotency (re-apply produces no diff).
export const functionSnapshot = async (fnName: string, region: string): Promise<FunctionSnapshot> => {
  const config = await getConfiguration(fnName, region);
  const vars = config.Environment?.Variables ?? {};
  const ddEnv: Record<string, string> = {};
  for (const key of Object.keys(vars).sort()) {
    if (key.startsWith('DD_')) {
      ddEnv[key] = vars[key];
    }
  }

  return {
    handler: config.Handler,
    layerArns: (config.Layers ?? []).map((l) => l.Arn).sort(),
    ddEnv,
  };
};

export const verifyInstrumented = async (serviceName: string, region: string): Promise<void> => {
  const fnName = functionName(serviceName);
  // eslint-disable-next-line no-console
  console.log(`Verifying instrumented state of "${fnName}"...`);
  const config = await getConfiguration(fnName, region);
  const vars = config.Environment?.Variables ?? {};
  const layerArns = (config.Layers ?? []).map((l) => l.Arn);
  const expected = expectedLayerArns(region);

  // Handler is redirected to the Datadog wrapper, original is preserved.
  assert.equal(config.Handler, REDIRECT_HANDLER, 'handler not redirected to the Datadog wrapper');
  assert.equal(
    vars.DD_LAMBDA_HANDLER,
    ORIGINAL_HANDLER,
    'DD_LAMBDA_HANDLER should hold the original handler (a different value means a double-wrap)',
  );

  // Layers: library layer + extension layer, each present exactly once (no dup),
  // pinned to the versions in src/layers.json.
  assert.ok(
    layerArns.includes(expected.node),
    `missing pinned Node layer ${expected.node}; got ${JSON.stringify(layerArns)}`,
  );
  assert.ok(
    layerArns.includes(expected.extension),
    `missing pinned extension layer ${expected.extension}; got ${JSON.stringify(layerArns)}`,
  );
  assert.equal(layerArns.filter((a) => a === expected.node).length, 1, 'Node layer attached more than once');
  assert.equal(layerArns.filter((a) => a === expected.extension).length, 1, 'extension layer attached more than once');

  // Env: API key wiring + required DD_* vars + identity.
  assert.ok(
    API_KEY_VARS.some((k) => vars[k]),
    `no API key wiring env var set (one of ${API_KEY_VARS.join(', ')})`,
  );
  for (const key of REQUIRED_PRESENT) {
    assert.ok(vars[key], `missing required env var ${key}`);
  }
  assert.equal(vars.DD_TRACE_ENABLED, 'true', 'DD_TRACE_ENABLED should be true');
  assert.equal(vars.DD_SERVERLESS_LOGS_ENABLED, 'true', 'DD_SERVERLESS_LOGS_ENABLED should be true');
  assert.equal(vars.DD_SERVICE, serviceName, 'DD_SERVICE should carry the run-id service name');
  assert.equal(vars.DD_ENV, 'e2e', 'DD_ENV should be e2e');
  assert.equal(vars.DD_VERSION, '1.0.0', 'DD_VERSION should be 1.0.0');

  // Tags: plugin marker (proof the plugin tagged the function) + freshness tag
  // (set atomically at creation for the sweeper). Service/env/version identity is
  // carried by the DD_* env vars above and on the ingested telemetry.
  const tags = await getTags(config.FunctionArn, region);
  assert.match(tags[TAG_PLUGIN] ?? '', /^v\d+\.\d+\.\d+/, 'dd_sls_plugin tag should be v<version>');
  assert.ok(tags[FRESHNESS_TAG_KEY], `missing freshness tag ${FRESHNESS_TAG_KEY}`);

  // eslint-disable-next-line no-console
  console.log('All instrumented checks passed.');
};

// After `sls remove` the whole stack is torn down -- the function itself is gone,
// which is the clean end-state for this mechanism (no per-resource un-instrument).
// Assert absence explicitly.
export const verifyUninstrumented = async (serviceName: string, region: string): Promise<void> => {
  const fnName = functionName(serviceName);
  // eslint-disable-next-line no-console
  console.log(`Verifying clean (removed) state of "${fnName}"...`);
  const result = await execPromise(
    `aws lambda get-function-configuration --function-name "${fnName}" --region "${region}" --output json`,
  );
  assert.notEqual(result.exitCode, 0, 'function still exists after remove');
  assert.match(
    `${result.stdout} ${result.stderr}`,
    /ResourceNotFoundException|Function not found/,
    `expected ResourceNotFoundException, got: ${result.stderr || result.stdout}`,
  );

  // eslint-disable-next-line no-console
  console.log('Clean-state check passed (function and its DD config are gone).');
};
