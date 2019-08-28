/*
 * Unless explicitly stated otherwise all files in this repository are licensed
 * under the Apache License Version 2.0.
 *
 * This product includes software developed at Datadog (https://www.datadoghq.com/).
 * Copyright 2019 Datadog, Inc.
 */

export function pythonTemplate(filePath: string, method: string) {
  const newPath = filePath.replace("/", ".").replace("\\", ".");
  return `from datadog_lambda.wrapper import datadog_lambda_wrapper
from ${newPath} import ${method} as ${method}_impl
${method} = datadog_lambda_wrapper(${method}_impl)`;
}
