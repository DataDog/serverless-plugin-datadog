// Minimal Node.js workload for the e2e suite. Duplicated from the default
// handler in serverless-self-monitoring (lambda-managed-instances/handlers/default/nodejs),
// with one log line added so a log record is emitted on every invocation.
//
// No tracer setup lives here on purpose: the serverless-plugin-datadog wiring
// (Datadog Node layer + extension + redirected handler) auto-instruments the
// invocation and auto-collects logs. The e2e suite tests that wiring, not the
// runtime, so this handler stays trivial.
exports.handler = async function (_event, _context) {
  console.log(`one-e2e serverless-plugin-datadog lambda invocation service=${process.env.DD_SERVICE}`);

  return {
    statusCode: 200,
    body: "hello, world",
  };
};
