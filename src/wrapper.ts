import { HandlerInfo, RuntimeType } from "./layer";
import { nodeTemplate } from "./templates/node-js-template";
import { pythonTemplate } from "./templates/python-template";

export function getWrapperText(handlerInfo: HandlerInfo) {
  const handlerfile = handlerInfo.handler.handler;
  const parts = handlerfile.split(".");
  if (parts.length < 2) {
    return;
  }
  const method = parts[parts.length - 1];
  const filename = parts.slice(0, -1).join(".");
  switch (handlerInfo.type) {
    case RuntimeType.NODE:
      return nodeTemplate(filename, method);
    case RuntimeType.PYTHON:
      return pythonTemplate(filename, method);
  }
}
