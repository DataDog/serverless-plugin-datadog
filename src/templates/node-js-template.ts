export function nodeTemplate(filePath: string, method: string) {
  return `const { datadog } = require("datadog-lambda-js");
const original = require("${filePath}");
module.exports.${method} = datadog(original.${method});`;
}
