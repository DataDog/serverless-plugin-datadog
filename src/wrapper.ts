/*
 * Unless explicitly stated otherwise all files in this repository are licensed
 * under the Apache License Version 2.0.
 *
 * This product includes software developed at Datadog (https://www.datadoghq.com/).
 * Copyright 2019 Datadog, Inc.
 */

import Service from "serverless/classes/Service";
import { FunctionInfo, RuntimeType } from "./layer";
import { getHandlerPath } from "./util";

const datadogHandlerEnvVar = "DD_LAMBDA_HANDLER";
const pythonHandler = "datadog_lambda.handler.handler";
const pythonHandlerFile = "datadog_lambda.handler.py";
const jsHandler = "node_modules/datadog-lambda-js/dist/handler.handler";
const jsHandlerFile = "node_modules/datadog-lambda-js/dist/handler.js";

export async function writeHandlers(service: Service, funcs: FunctionInfo[]) {
  console.log("At writeHandlers...");
  funcs.map((func) => {
    console.log(`Processing ${func.name}`);

    setEnvDatadogHandler(func);
    const handlerInfo = getDDHandler(func.type);
    if (handlerInfo === undefined) {
      return;
    }
    const { handler, handlerFile } = handlerInfo;

    console.log(`New handler is ${handler}`);
    console.log(`New handler file is ${handlerFile}`);

    console.log(`Handler before change: ${func.handler.handler}`);
    func.handler.handler = handler;
    console.log(`Handler after change: ${func.handler.handler}`);

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
  });
}

function getDDHandler(type: RuntimeType | undefined) {
  console.log("Start of getDDHandler");
  if (type === undefined) {
    return;
  }
  switch (type) {
    case RuntimeType.NODE:
      console.log("type is node");
    case RuntimeType.NODE_TS:
      console.log("type is node_ts");
    case RuntimeType.NODE_ES6:
      console.log("type is node_es6");
      return { handler: jsHandler, handlerFile: jsHandlerFile };
    case RuntimeType.PYTHON:
      return { handler: pythonHandler, handlerFile: pythonHandlerFile };
  }
}

function setEnvDatadogHandler(func: FunctionInfo) {
  console.log(`Setting environment lambda variable to be ${func.handler.handler}...`);
  const originalHandler = func.handler.handler;

  var environment = (func.handler as any).environment;
  if (environment === undefined) {
    environment = {};
  }

  environment[datadogHandlerEnvVar] = originalHandler;
  (func.handler as any).environment = environment;
}
