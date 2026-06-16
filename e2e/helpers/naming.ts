import crypto from 'node:crypto';

// Resource-hygiene convention shared across the e2e suites (see spec "Resource
// Hygiene"). The name prefix is the identity + blast-radius guard the sweeper
// keys on; the freshness tag lets it age resources out safely.

export const TOOL = 'slsplugin';
export const PLATFORM = 'lambda';

// `one` = team marker (`dd-` implied). Prefix is set atomically at creation.
// Lambda function names (max 64) end up as `<service>-<stage>-<fn>`; with an
// 8-char run id this stays well under the limit.
export const namePrefix = (runId: string): string => `one-e2e-${TOOL}-${PLATFORM}-${runId}`;

export const newRunId = (): string => crypto.randomBytes(4).toString('hex');

// Freshness tag value. Native creation time isn't usable cross-cloud, so we stamp
// it ourselves at create time. Key is `one_e2e_created`.
export const FRESHNESS_TAG_KEY = 'one_e2e_created';
export const freshnessTimestamp = (): string => `${Math.floor(Date.now() / 1000)}`;
