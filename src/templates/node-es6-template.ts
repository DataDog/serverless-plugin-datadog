/*
 * Unless explicitly stated otherwise all files in this repository are licensed
 * under the Apache License Version 2.0.
 *
 * This product includes software developed at Datadog (https://www.datadoghq.com/).
 * Copyright 2019 Datadog, Inc.
 */

export function es6Template(filePath: string, methods: string[]) {
  const methodsString = methodsTemplate(methods);
  return (
    `/* eslint-disable */
  const { datadog } = require("datadog-lambda-js");
  import * as original from "../${filePath}";` + methodsString
  );
}

function methodsTemplate(methods: string[]) {
  let data = "";
  for (const method of methods) {
    data += "\n";
    data += `  export const ${method} = datadog(original.${method});`;
  }
  return data;
}
