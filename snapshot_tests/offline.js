'use strict';

/**
 * Serverless plugin that intercepts CloudFormation.describeStacks during packaging.
 *
 * When custom Lambda layers are defined, Serverless Framework calls
 * CloudFormation.describeStacks in compareWithLastLayer() to check whether a
 * layer has already been uploaded (an optimisation to avoid re-uploading
 * unchanged layers).  The error handler in that function only silences errors
 * whose message contains "does not exist"; any other error – including the
 * "The security token included in the request is invalid" response AWS returns
 * when credentials are absent or invalid – is re-thrown, causing sls package
 * to fail.
 *
 * In snapshot tests we never deploy, so this optimisation is meaningless.
 * This plugin intercepts the describeStacks call and immediately returns a
 * synthetic "does not exist" error, which the Serverless handler treats as a
 * fresh stack and skips the comparison entirely.  The rest of the packaging
 * lifecycle is unaffected.
 *
 * This shim exists because Serverless Framework has no credential-free packaging mode
 * when custom layers are defined. Tracked upstream:
 *   https://github.com/serverless/serverless/issues/8187 (root cause, open since 2020)
 *   https://github.com/serverless/serverless/issues/12969 (feature request for --artifacts-only)
 * If either issue is resolved, this plugin can be removed.
 */
class OfflinePackaging {
  constructor(serverless) {
    this.serverless = serverless;
    this.hooks = {
      'before:package:compileLayers': () => this.patchProvider(),
    };
  }

  patchProvider() {
    const provider = this.serverless.getProvider('aws');
    const original = provider.request.bind(provider);
    provider.request = (service, method, params, options) => {
      if (service === 'CloudFormation' && method === 'describeStacks') {
        const stackName = (params && params.StackName) || 'unknown';
        return Promise.reject(new Error(`Stack with id ${stackName} does not exist`));
      }
      return original(service, method, params, options);
    };
  }
}

module.exports = OfflinePackaging;
