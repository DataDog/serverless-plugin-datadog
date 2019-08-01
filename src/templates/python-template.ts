export function pythonTemplate(filePath: string, method: string) {
  const newPath = filePath.replace("/", ".").replace("\\", ".");
  return `from datadog_lambda.wrapper import datadog_lambda_wrapper
from ${newPath} import ${method} as ${method}_impl
${method} = datadog_lambda_wrapper(${method}_impl)`;
}
