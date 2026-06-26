/*
 * Unless explicitly stated otherwise all files in this repository are licensed
 * under the Apache License Version 2.0.
 *
 * This product includes software developed at Datadog (https://www.datadoghq.com/).
 * Copyright 2026 Datadog, Inc.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

import {type E2ENaming} from './naming';
import {type ExpectedLayers, type LambdaVerifierConfig} from './lambda-verifier';

// Repo-local config feeding the shared e2e helpers. This file is NOT synced -- it holds
// everything specific to serverless-plugin-datadog that the shared, parameterized helpers
// read through their config arguments.

export const NAMING: E2ENaming = {tool: 'slsplugin', platform: 'lambda'};

export const ENV_NAME = 'e2e';
export const ENV_VERSION = '1.0.0';
const RUNTIME = 'nodejs20.x';

// Transient cloud-provider errors safe to retry, passed as ExecOptions.retryPatterns.
export const RETRY_PATTERNS = [
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

// `sls deploy` names functions `<service>-<stage>-<fn>`; stage is pinned to `e2e` and the
// only function is `hello`.
export const functionName = (serviceName: string): string => `${serviceName}-e2e-hello`;

// Pinned artifact versions come from the plugin's own src/layers.json, so a version
// mismatch blames the plugin/registry, not upstream drift.
const expectedLayerArns = (region: string): ExpectedLayers => {
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

export const VERIFIER: LambdaVerifierConfig = {
  functionName,
  expectedLayerArns,
  redirectHandler: '/opt/nodejs/node_modules/datadog-lambda-js/handler.handler',
  originalHandler: 'handler.handler',
  // With the extension enabled the plugin tags the function with its own version marker.
  toolTag: {key: 'dd_sls_plugin', pattern: /^v\d+\.\d+\.\d+/},
  env: {
    apiKeyVars: ['DD_API_KEY', 'DD_API_KEY_SECRET_ARN', 'DD_KMS_API_KEY', 'DD_API_KEY_SSM_ARN'],
    present: ['DD_SITE'],
    values: (serviceName) => ({
      DD_TRACE_ENABLED: 'true',
      DD_SERVERLESS_LOGS_ENABLED: 'true',
      DD_SERVICE: serviceName,
      DD_ENV: ENV_NAME,
      DD_VERSION: ENV_VERSION,
    }),
  },
};
