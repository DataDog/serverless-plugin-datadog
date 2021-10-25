/*
 * Unless explicitly stated otherwise all files in this repository are licensed
 * under the Apache License Version 2.0.
 *
 * This product includes software developed at Datadog (https://www.datadoghq.com/).
 * Copyright 2021 Datadog, Inc.
 */

import { FunctionDefinitionHandler } from "serverless";
import { FunctionInfo, isFunctionDefinitionHandler, RuntimeType } from "./layer";

export const datadogHandlerEnvVar = "DD_LAMBDA_HANDLER";
export const pythonHandler = "datadog_lambda.handler.handler";
export const jsHandlerWithLayers = "/opt/nodejs/node_modules/datadog-lambda-js/handler.handler";
export const jsHandler = "node_modules/datadog-lambda-js/dist/handler.handler";

/**
 * For each lambda function, redirects handler to the Datadog handler for the given runtime,
 * and sets Datadog environment variable `DD_LAMBDA_HANDLER` to the original handler.
 */
export function redirectHandlers(funcs: FunctionInfo[], addLayers: boolean, customHandler?: string) {
  funcs.forEach((func) => {
    const handler = getDDHandler(func.type, addLayers, customHandler);
    if (handler === undefined) {
      return;
    }
    const funcDef = func.handler;
    if (!isFunctionDefinitionHandler(funcDef)) {
      return;
    }
    setEnvDatadogHandler(funcDef);

    funcDef.handler = handler;
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

function getDDHandler(lambdaRuntime: RuntimeType | undefined, addLayers: boolean, customHandler?: string) {
  if (lambdaRuntime === undefined) {
    return;
  }
  if (customHandler) {
    return customHandler;
  }
  switch (lambdaRuntime) {
    case RuntimeType.NODE:
      return addLayers ? jsHandlerWithLayers : jsHandler;
    case RuntimeType.PYTHON:
      return pythonHandler;
  }
}

function setEnvDatadogHandler(func: FunctionDefinitionHandler) {
  const originalHandler = func.handler;
  const environment = func.environment ?? {};
  environment[datadogHandlerEnvVar] = originalHandler;
  func.environment = environment;
}
