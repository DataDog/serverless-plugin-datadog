# serverless-plugin-datadog e2e suite

End-to-end coverage for the AWS Lambda instrumentation this plugin performs. It
deploys a real, ephemeral Lambda with the plugin enabled, verifies the deployed
config and the telemetry it produces in Datadog, proves re-deploy is idempotent,
then tears the stack down and verifies a clean end-state.

Conforms to the shared contract in `serverless-ci/e2e/spec.md`; mirrors the
`datadog-ci` reference suite (`e2e/cloud-run.test.ts` + `e2e/helpers/*`).

## What it does

```
sls deploy (APPLY: provision + instrument)  -> verify CONFIG
  -> aws lambda invoke (trigger)             -> verify TELEMETRY (traces + logs)
  -> sls deploy again                         -> assert IDEMPOTENT (no diff/dup)
  -> sls remove (REMOVE)                      -> verify CLEAN (function gone)
  -> teardown (always, even on failure)
```

For this tool the plugin runs as part of `sls deploy`, so provisioning the
uninstrumented workload and APPLY are the same step. REMOVE deletes the whole
CloudFormation stack, so the clean end-state is the function (and all its DD
config) being absent -- asserted explicitly.

**Config verified** (`helpers/lambda-verifier.ts`): the pinned Datadog Node layer
+ extension layer (versions read from `../src/layers.json`, so drift blames the
plugin), the redirected handler with the original preserved in `DD_LAMBDA_HANDLER`,
the required `DD_*` env vars, and the `service` / `env` / `version` / `dd_sls_plugin`
tags. Identity (run-id service name, env, version) is asserted -- not mere presence.

**Telemetry verified** (`helpers/lambda-telemetry-checker.ts`): spans and logs are
polled (15s × 20) filtered by the unique service name, and the matched records must
carry the full identity (service + env + version), not just exist.

## Resource hygiene

Every run uses a unique name `one-e2e-slsplugin-lambda-<runid>` and stamps a
`one_e2e_created:<unix-ts>` tag at creation (`helpers/naming.ts`). The shared
cross-repo sweeper ages out anything older than the grace window. In-test teardown
runs in `afterAll` regardless of outcome.

## Prerequisites

- **Node 20** and **npm** (the suite is a standalone npm project, isolated from the
  plugin's Yarn Berry setup).
- The plugin is built and the fixture is installed automatically by `pretest`
  (`npm test` runs `yarn build` at the repo root, then `npm install` in the fixture).
- **AWS auth** with permission to deploy Lambda / CloudFormation in the target
  account. Locally, wrap the run with `aws-vault`:
  ```
  aws-vault exec sso-serverless-sandbox-account-admin -- npm test
  ```
  In CI, credentials come from GitHub→AWS OIDC (no static keys).
- **Datadog keys**: `DATADOG_API_KEY` (wired into the extension and used for the API
  client) and `DATADOG_APP_KEY` (used to poll spans/logs).

## Run locally

```
cd e2e
cp .env.local.example .env.local   # fill in DATADOG_API_KEY / DATADOG_APP_KEY
npm install
aws-vault exec sso-serverless-sandbox-account-admin -- npm test
```

`.env.local` is loaded automatically (real env vars win). Set `SKIP_LAMBDA_TESTS=true`
to skip the suite.

## Configuration

| Env var            | Required | Default          | Purpose                                        |
| ------------------ | -------- | ---------------- | ---------------------------------------------- |
| `DATADOG_API_KEY`  | yes      | --               | Wired into the extension + API-client auth     |
| `DATADOG_APP_KEY`  | yes      | --               | API-client auth for span/log polling           |
| `DATADOG_SITE`     | no       | `datadoghq.com`  | Datadog site                                   |
| `AWS_REGION`       | no       | `us-east-1`      | Deploy region (must be pinned in `layers.json`)|
| `SKIP_LAMBDA_TESTS`| no       | --               | `true` skips the suite                         |

(AWS credentials come from the ambient AWS env / `aws-vault` / OIDC.)

## CI

`.github/workflows/e2e.yml` runs the suite behind a `dorny/paths-filter` gate
(`src/**`, `e2e/**`, the workflow file) and the `SKIP_LAMBDA_TESTS` flag, with
GitHub→AWS OIDC (`aws-actions/configure-aws-credentials`). Required repo settings:

- Datadog auth (dd-sts): short-lived API + App keys minted at runtime via
  [`DataDog/dd-sts-action`](https://github.com/DataDog/dd-sts-action) under the
  `serverless-plugin-datadog-e2e` policy -- no static Datadog keys in this repo
- Variables: `AWS_ROLE_ARN_E2E` (the OIDC deploy role), `AWS_REGION_E2E` (default
  `us-east-1`), optionally `DD_SITE_E2E`

The OIDC deploy role and the policy backing it are cataloged in
`serverless-ci/e2e/iam-infra.md`.
