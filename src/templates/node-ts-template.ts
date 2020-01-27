/*
 * Unless explicitly stated otherwise all files in this repository are licensed
 * under the Apache License Version 2.0.
 *
 * This product includes software developed at Datadog (https://www.datadoghq.com/).
 * Copyright 2019 Datadog, Inc.
 */

export function typescriptTemplate(filePath: string, method: string) {
  return `/* tslint:disable */
/* eslint-disable */
const { datadog } = require("datadog-lambda-js") as any;
import * as original from "../${filePath}";
export const ${method} = datadog(original.${method});`;
}
