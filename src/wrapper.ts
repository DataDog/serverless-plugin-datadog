/*
 * Unless explicitly stated otherwise all files in this repository are licensed
 * under the Apache License Version 2.0.
 *
 * This product includes software developed at Datadog (https://www.datadoghq.com/).
 * Copyright 2019 Datadog, Inc.
 */

import { FunctionInfo, RuntimeType } from "./layer";

export const datadogHandlerEnvVar = "DD_LAMBDA_HANDLER";
export const pythonHandler = "datadog_lambda.handler.handler";
export const jsHandlerWithLayers = "/opt/nodejs/node_modules/datadog-lambda-js/handler.handler";
export const jsHandler = "node_modules/datadog-lambda-js/handler.handler";

/**
 * For each lambda function, redirects handler to the Datadog handler for the given runtime,
 * and sets Datadog environment variable `DD_LAMBDA_HANDLER` to the original handler.
 */
export function redirectHandlers(funcs: FunctionInfo[], addLayers: boolean) {
  funcs.forEach((func) => {
    setEnvDatadogHandler(func);
    const handler = getDDHandler(func.type, addLayers);
    if (handler === undefined) {
      return;
    }
    func.handler.handler = handler;
    if (func.handler.package === undefined) {
      func.handler.package = {
        exclude: [],
        include: [],
      };
    }
    if (func.handler.package.include === undefined) {
      func.handler.package.include = [];
    }
  });
}

function getDDHandler(lambdaRuntime: RuntimeType | undefined, addLayers: boolean) {
  if (lambdaRuntime === undefined) {
    return;
  }
  switch (lambdaRuntime) {
    case RuntimeType.NODE:
      return addLayers ? jsHandlerWithLayers : jsHandler;
    case RuntimeType.PYTHON:
      return pythonHandler;
  }
}

function setEnvDatadogHandler(func: FunctionInfo) {
  const originalHandler = func.handler.handler;
  const environment = (func.handler as any).environment ?? {};
  environment[datadogHandlerEnvVar] = originalHandler;
  (func.handler as any).environment = environment;
}
