/*
 * Unless explicitly stated otherwise all files in this repository are licensed
 * under the Apache License Version 2.0.
 *
 * This product includes software developed at Datadog (https://www.datadoghq.com/).
 * Copyright 2019 Datadog, Inc.
 */

import fs from "fs";
import Service from "serverless/classes/Service";
import util from "util";
import { FunctionInfo, RuntimeType } from "./layer";
import { removeDirectory } from "./util";

export const datadogDirectory = "datadog_handlers";
const datadogHandlerEnvVar = "DD_LAMBDA_HANDLER";

const pythonHandler = "datadog_lambda.handler.handler";
const pythonHandlerFile = "datadog_lambda.handler.py";

const originalJsHandlerFile = "node_modules/datadog-lambda-js/dist/handler.js";
const copyJsHandlerFile = `${datadogDirectory}/jsHandler.js`;
const jsHandler = `${datadogDirectory}/jsHandler.handler`;

export async function writeHandlers(service: Service, funcs: FunctionInfo[]) {
  await cleanupHandlers();
  await util.promisify(fs.mkdir)(datadogDirectory);
  await util.promisify(fs.copyFile)(originalJsHandlerFile, copyJsHandlerFile);

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
    func.handler.package.include.push(copyJsHandlerFile);
  });
  addToExclusionList(service, [copyJsHandlerFile]);
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
      return { handler: jsHandler, handlerFile: copyJsHandlerFile };
    case RuntimeType.PYTHON:
      return { handler: pythonHandler, handlerFile: pythonHandlerFile };
  }
}

function setEnvDatadogHandler(func: FunctionInfo) {
  console.log(`Setting environment lambda variable to be ${func.handler.handler}...`);
  const originalHandler = func.handler.handler;

  const environment = (func.handler as any).environment ?? {};
  environment[datadogHandlerEnvVar] = originalHandler;
  (func.handler as any).environment = environment;
}

export async function cleanupHandlers() {
  await removeDirectory(datadogDirectory);
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
