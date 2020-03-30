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
import { FunctionInfo, RuntimeType } from "./layer";
import { es6Template } from "./templates/node-es6-template";
import { nodeTemplate } from "./templates/node-js-template";
import { typescriptTemplate } from "./templates/node-ts-template";
import { pythonTemplate } from "./templates/python-template";
import { getHandlerPath, removeDirectory } from "./util";

export const datadogDirectory = "datadog_handlers";

export interface FunctionGroup {
  funcs: {
    info: FunctionInfo;
    method: string;
  }[];
  filename: string;
  runtime: RuntimeType;
}

export async function writeHandlers(service: Service, funcs: FunctionInfo[]) {
  await cleanupHandlers();
  await util.promisify(fs.mkdir)(datadogDirectory);
  const groups = getFunctionGroups(funcs);
  const promises = groups.map(async (funcGroup) => {
    const methods = getMethods(funcGroup);
    const result = getWrapperText(funcGroup.runtime, funcGroup.filename, methods);
    if (result === undefined) {
      return;
    }
    const text = result;
    const filename = await writeWrapperFunction(funcGroup, text);
    const baseMethodName = path.posix.join(datadogDirectory, funcGroup.funcs[0].info.name);
    for (const func of funcGroup.funcs) {
      func.info.handler.handler = `${baseMethodName}.${func.method}`;
      if (func.info.handler.package === undefined) {
        func.info.handler.package = {
          exclude: [],
          include: [],
        };
      }
      if (func.info.handler.package.include === undefined) {
        func.info.handler.package.include = [];
      }
      func.info.handler.package.include.push(filename);
    }
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

export function getWrapperText(type: RuntimeType, filename: string, methods: string[]) {
  switch (type) {
    case RuntimeType.NODE:
      return nodeTemplate(filename, methods);
    case RuntimeType.NODE_ES6:
      return es6Template(filename, methods);
    case RuntimeType.NODE_TS:
      return typescriptTemplate(filename, methods);
    case RuntimeType.PYTHON:
      return pythonTemplate(filename, methods);
  }
}

export function getFunctionGroups(functionInfos: FunctionInfo[]) {
  const lookup: {
    [key: string]: FunctionGroup;
  } = {};
  for (const func of functionInfos) {
    const handlerPath = getHandlerPath(func);
    if (handlerPath === undefined) {
      continue;
    }
    const group = lookup[handlerPath.filename] ?? {
      funcs: [],
      filename: handlerPath.filename,
      runtime: func.type,
    };
    group.funcs.push({ info: func, method: handlerPath.method });
    lookup[handlerPath.filename] = group;
  }
  return [...Object.values(lookup)];
}

export async function writeWrapperFunction(group: FunctionGroup, wrapperText: string) {
  const extension = getHandlerExtension(group.runtime);
  const filename = `${group.funcs[0].info.name}.${extension}`;

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

function getMethods(funcGroup: FunctionGroup) {
  // Dedups methods shared between multiple function groups
  return [...new Set(funcGroup.funcs.map((func) => func.method)).values()].sort();
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
