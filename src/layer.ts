/*
 * Unless explicitly stated otherwise all files in this repository are licensed
 * under the Apache License Version 2.0.
 *
 * This product includes software developed at Datadog (https://www.datadoghq.com/).
 * Copyright 2019 Datadog, Inc.
 */
import { FunctionDefinition } from "serverless";
import Service from "serverless/classes/Service";

export enum RuntimeType {
  NODE,
  PYTHON,
  UNSUPPORTED,
}

export interface FunctionInfo {
  name: string;
  type: RuntimeType;
  handler: FunctionDefinition;
  runtime?: string;
}

export interface LayerJSON {
  regions: {
    [region: string]:
      | {
          [runtime: string]: string | undefined;
        }
      | undefined;
  };
}

export const runtimeLookup: { [key: string]: RuntimeType } = {
  "nodejs10.x": RuntimeType.NODE,
  "nodejs12.x": RuntimeType.NODE,
  "nodejs8.10": RuntimeType.NODE,
  "python2.7": RuntimeType.PYTHON,
  "python3.6": RuntimeType.PYTHON,
  "python3.7": RuntimeType.PYTHON,
  "python3.8": RuntimeType.PYTHON,
};

export function findHandlers(service: Service, exclude: string[], defaultRuntime?: string): FunctionInfo[] {
  const funcs = (service as any).functions as { [key: string]: FunctionDefinition };

  return Object.entries(funcs)
    .map(([name, handler]) => {
      let { runtime } = handler;
      if (runtime === undefined) {
        runtime = defaultRuntime;
      }
      if (runtime !== undefined && runtime in runtimeLookup) {
        return { type: runtimeLookup[runtime], runtime, name, handler } as FunctionInfo;
      }
      return { type: RuntimeType.UNSUPPORTED, runtime, name, handler } as FunctionInfo;
    })
    .filter((result) => result !== undefined)
    .filter(
      (result) => exclude === undefined || (exclude !== undefined && !exclude.includes(result.name)),
    ) as FunctionInfo[];
}

export function applyLayers(region: string, handlers: FunctionInfo[], layers: LayerJSON) {
  const regionRuntimes = layers.regions[region];
  if (regionRuntimes === undefined) {
    return;
  }

  for (const handler of handlers) {
    if (handler.type === RuntimeType.UNSUPPORTED) {
      continue;
    }

    const { runtime } = handler;
    const layerARN = runtime !== undefined ? regionRuntimes[runtime] : undefined;
    if (layerARN !== undefined) {
      const currentLayers = getLayers(handler);
      if (!new Set(currentLayers).has(layerARN)) {
        currentLayers.push(layerARN);
      }
      setLayers(handler, currentLayers);
    }
  }
}

function getLayers(handler: FunctionInfo) {
  const layersList = (handler.handler as any).layers as string[] | undefined;
  if (layersList === undefined) {
    return [];
  }
  return layersList;
}

function setLayers(handler: FunctionInfo, layers: string[]) {
  (handler.handler as any).layers = layers;
}
