/*
 * Unless explicitly stated otherwise all files in this repository are licensed
 * under the Apache License Version 2.0.
 *
 * This product includes software developed at Datadog (https://www.datadoghq.com/).
 * Copyright 2019 Datadog, Inc.
 */

import { TracingMode } from "./common";

export function nodeTemplate(filePath: string, methods: string[], mode: TracingMode) {
  const methodsString = methodsTemplate(methods);
  const tracerString = tracerTemplate(mode);

  return `const { datadog } = require("datadog-lambda-js");
${tracerString}
const original = require("../${filePath}");
${methodsString}`;
}

function tracerTemplate(mode: TracingMode): string {
  switch (mode) {
    case TracingMode.DD_TRACE:
    case TracingMode.HYBRID:
      return 'import { tracer } from "dd-trace-js"\ntracer.init();';
    case TracingMode.XRAY:
    case TracingMode.NONE:
      return "";
  }
}

function methodsTemplate(methods: string[]) {
  let data = "";
  for (const method of methods) {
    data += "\n";
    data += `module.exports.${method} = datadog(original.${method});`;
  }
  return data;
}
