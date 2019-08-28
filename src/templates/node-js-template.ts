/*
 * Unless explicitly stated otherwise all files in this repository are licensed
 * under the Apache License Version 2.0.
 *
 * This product includes software developed at Datadog (https://www.datadoghq.com/).
 * Copyright 2019 Datadog, Inc.
 */

export function nodeTemplate(filePath: string, method: string) {
  return `const { datadog } = require("datadog-lambda-js");
const original = require("../${filePath}");
module.exports.${method} = datadog(original.${method});`;
}
