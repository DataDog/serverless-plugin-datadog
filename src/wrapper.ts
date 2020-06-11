/*
 * Unless explicitly stated otherwise all files in this repository are licensed
 * under the Apache License Version 2.0.
 *
 * This product includes software developed at Datadog (https://www.datadoghq.com/).
 * Copyright 2019 Datadog, Inc.
 */

import Service from "serverless/classes/Service";
import { FunctionInfo, RuntimeType } from "./layer";

export const datadogHandlerEnvVar = "DD_LAMBDA_HANDLER";
export const pythonHandler = "datadog_lambda.handler.handler";
export const pythonHandlerFile = "datadog_lambda.handler.py";
export const jsHandlerLayerPrefix = "/opt/nodejs/";
export const jsHandler = "node_modules/datadog-lambda-js/handler.handler";
export const jsHandlerFile = "node_modules/datadog-lambda-js/handler.js";

/**
 * For each lambda function, redirects handler to the Datadog handler for the given runtime,
 * and sets Datadog environment variable `DD_LAMBDA_HANDLER` to the original handler.
 */
export function redirectHandlers(service: Service, funcs: FunctionInfo[], addLayers: boolean) {
  const handlerFiles = new Set<string>();
  funcs.forEach((func) => {
    setEnvDatadogHandler(func);
    const handlerInfo = getDDHandler(func.type, addLayers);
    if (handlerInfo === undefined) {
      return;
    }
    const { handler, handlerFile } = handlerInfo;
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
    func.handler.package.include.push(handlerFile);
    handlerFiles.add(handlerFile);
  });
  addToExclusionList(service, [...handlerFiles]);
}

function getDDHandler(lambdaRuntime: RuntimeType | undefined, addLayers: boolean) {
  if (lambdaRuntime === undefined) {
    return;
  }
  switch (lambdaRuntime) {
    case RuntimeType.NODE:
    case RuntimeType.NODE_TS:
    case RuntimeType.NODE_ES6:
      const finalJsHandler = addLayers ? `${jsHandlerLayerPrefix}${jsHandler}` : jsHandler;
      const finalJsHandlerFile = addLayers ? `${jsHandlerLayerPrefix}${jsHandlerFile}` : jsHandlerFile;
      return { handler: finalJsHandler, handlerFile: finalJsHandlerFile };
    case RuntimeType.PYTHON:
      return { handler: pythonHandler, handlerFile: pythonHandlerFile };
  }
}

function setEnvDatadogHandler(func: FunctionInfo) {
  const originalHandler = func.handler.handler;
  const environment = (func.handler as any).environment ?? {};
  environment[datadogHandlerEnvVar] = originalHandler;
  (func.handler as any).environment = environment;
}

export async function addToExclusionList(service: any, files: string[]) {
  if (service.package === undefined) {
    service.package = {};
  }
  const pack = service.package;
  if (pack.include === undefined) {
    pack.include = [];
  }
  pack.include.push(...files);
}
