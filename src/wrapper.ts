/*
 * Unless explicitly stated otherwise all files in this repository are licensed
 * under the Apache License Version 2.0.
 *
 * This product includes software developed at Datadog (https://www.datadoghq.com/).
 * Copyright 2019 Datadog, Inc.
 */

import fs from "fs";
import path from "path";
import Service from "serverless/classes/Service";
import util from "util";
import { HandlerInfo, RuntimeType } from "./layer";
import { es6Template } from "./templates/node-es6-template";
import { nodeTemplate } from "./templates/node-js-template";
import { typescriptTemplate } from "./templates/node-ts-template";
import { pythonTemplate } from "./templates/python-template";
import { getHandlerPath, removeDirectory } from "./util";

export const datadogDirectory = "datadog_handlers";

export async function writeHandlers(service: Service, handlers: HandlerInfo[]) {
  await cleanupHandlers();
  await util.promisify(fs.mkdir)(datadogDirectory);

  const promises = handlers.map(async (handlerInfo) => {
    const result = getWrapperText(handlerInfo);
    if (result === undefined) {
      return;
    }
    const { text, method } = result;
    const filename = await writeWrapperFunction(handlerInfo, text);
    handlerInfo.handler.handler = `${path.posix.join(datadogDirectory, handlerInfo.name)}.${method}`;
    if (handlerInfo.handler.package === undefined) {
      handlerInfo.handler.package = {
        exclude: [],
        include: [],
      };
    }
    if (handlerInfo.handler.package.include === undefined) {
      handlerInfo.handler.package.include = [];
    }
    handlerInfo.handler.package.include.push(filename);
    return `${filename}`;
  });
  const files = [...(await Promise.all(promises))];
  const allFiles = files.filter((file) => file !== undefined) as string[];
  allFiles.push(path.join(datadogDirectory, "**"));
  addToExclusionList(service, allFiles);
}

export async function cleanupHandlers() {
  await removeDirectory(datadogDirectory);
}

export function getWrapperText(handlerInfo: HandlerInfo) {
  const result = getHandlerPath(handlerInfo);
  if (result === undefined) {
    return;
  }
  const { method, filename } = result;

  switch (handlerInfo.type) {
    case RuntimeType.NODE:
      return { text: nodeTemplate(filename, [method]), method };
    case RuntimeType.NODE_ES6:
      return { text: es6Template(filename, [method]), method };
    case RuntimeType.NODE_TS:
      return { text: typescriptTemplate(filename, [method]), method };
    case RuntimeType.PYTHON:
      return { text: pythonTemplate(filename, [method]), method };
  }
}

export async function writeWrapperFunction(handlerInfo: HandlerInfo, wrapperText: string) {
  const extension = getHandlerExtension(handlerInfo.type);
  const filename = `${handlerInfo.name}.${extension}`;

  const pathname = path.join(datadogDirectory, filename);
  await util.promisify(fs.writeFile)(pathname, wrapperText);
  return pathname;
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

function getHandlerExtension(type: RuntimeType) {
  switch (type) {
    case RuntimeType.NODE_ES6:
    case RuntimeType.NODE:
      return "js";
    case RuntimeType.NODE_TS:
      return "ts";
    case RuntimeType.PYTHON:
      return "py";
    case RuntimeType.UNSUPPORTED:
      return "";
  }
}
