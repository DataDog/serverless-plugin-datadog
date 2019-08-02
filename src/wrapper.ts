import { HandlerInfo, RuntimeType } from "./layer";
import { nodeTemplate } from "./templates/node-js-template";
import { pythonTemplate } from "./templates/python-template";
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";

const datadogDirectory = ".datadog";

export async function writeHandlers(handlers: HandlerInfo[]) {
  await removeDirectory(datadogDirectory);
  await promisify(fs.mkdir)(datadogDirectory);

  const promises = handlers.map(async (handlerInfo) => {
    const result = getWrapperText(handlerInfo);
    if (result === undefined) {
      return;
    }
    const { text, method } = result;
    await writeWrapperFunction(handlerInfo, text);
    handlerInfo.handler.handler = `${path.join(datadogDirectory, handlerInfo.name)}.${method}`;
  });
  await Promise.all(promises);
}

export function getWrapperText(handlerInfo: HandlerInfo) {
  const result = getHandlerPath(handlerInfo);
  if (result == undefined) {
    return;
  }
  const { method, filename } = result;

  switch (handlerInfo.type) {
    case RuntimeType.NODE:
      return { text: nodeTemplate(filename, method), method };
    case RuntimeType.PYTHON:
      return { text: pythonTemplate(filename, method), method };
  }
}

export async function writeWrapperFunction(handlerInfo: HandlerInfo, wrapperText: string) {
  const extension = handlerInfo.type === RuntimeType.PYTHON ? "py" : "js";
  const filename = `${handlerInfo.name}.${extension}`;
  const pathname = path.join(datadogDirectory, filename);
  await promisify(fs.writeFile)(pathname, wrapperText);
}

export function getHandlerPath(handlerInfo: HandlerInfo) {
  const handlerfile = handlerInfo.handler.handler;
  const parts = handlerfile.split(".");
  if (parts.length < 2) {
    return;
  }
  const method = parts[parts.length - 1];
  const filename = parts.slice(0, -1).join(".");
  return { method, filename };
}

export async function removeDirectory(path: string) {
  const exists = await promisify(fs.exists)(path);
  if (exists) {
    const files = await promisify(fs.readdir)(path);
    for (const file of files) {
      var curPath = path + "/" + file;
      const stats = await promisify(fs.lstat)(curPath);
      if (stats.isDirectory()) {
        // recurse
        await removeDirectory(curPath);
      } else {
        // delete file
        await promisify(fs.unlink)(curPath);
      }
    }
    await promisify(fs.rmdir)(path);
  }
}
