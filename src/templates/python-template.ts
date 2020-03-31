/*
 * Unless explicitly stated otherwise all files in this repository are licensed
 * under the Apache License Version 2.0.
 *
 * This product includes software developed at Datadog (https://www.datadoghq.com/).
 * Copyright 2019 Datadog, Inc.
 */

export function pythonTemplate(filePath: string, methods: string[]) {
  const newPath = filePath.split(/\/|\\/).join(".");
  const methodsString = methodsTemplate(newPath, methods);

  return `from datadog_lambda.wrapper import datadog_lambda_wrapper` + methodsString;
}

function methodsTemplate(newPath: string, methods: string[]) {
  let data = "";
  for (const method of methods) {
    data += "\n";
    data += `from ${newPath} import ${method} as ${method}_impl
${method} = datadog_lambda_wrapper(${method}_impl)`;
  }
  return data;
}
