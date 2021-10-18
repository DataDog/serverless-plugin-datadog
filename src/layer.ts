/*
 * Unless explicitly stated otherwise all files in this repository are licensed
 * under the Apache License Version 2.0.
 *
 * This product includes software developed at Datadog (https://www.datadoghq.com/).
 * Copyright 2021 Datadog, Inc.
 */
import { FunctionDefinition, FunctionDefinitionHandler } from "serverless";
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
  architecture?: string;
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
  "nodejs14.x": RuntimeType.NODE,
  "python2.7": RuntimeType.PYTHON,
  "python3.6": RuntimeType.PYTHON,
  "python3.7": RuntimeType.PYTHON,
  "python3.8": RuntimeType.PYTHON,
  "python3.9": RuntimeType.PYTHON,
};

export const armKeys: { [key: string]: string } = {
  "python3.8": "python3.8-arm",
  "python3.9": "python3.9-arm",
  extension: "extension-arm",
};

export function findHandlers(service: Service, exclude: string[], defaultRuntime?: string): FunctionInfo[] {
  return Object.entries(service.functions)
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

export function applyLambdaLibraryLayers(region: string, handlers: FunctionInfo[], layers: LayerJSON) {
  const regionRuntimes = layers.regions[region];
  if (regionRuntimes === undefined) {
    return;
  }

  for (const handler of handlers) {
    if (handler.type === RuntimeType.UNSUPPORTED) {
      continue;
    }

    const { runtime, architecture } = handler;
    let runtimeKey: string | undefined = runtime;
    if (architecture === "arm64" && runtime && runtime in armKeys) {
      runtimeKey = armKeys[runtime];
      removePreviousLayer(handler, regionRuntimes[runtime]);
    }

    const lambdaLayerARN = runtimeKey !== undefined ? regionRuntimes[runtimeKey] : undefined;
    let currentLayers = getLayers(handler);
    if (lambdaLayerARN) {
      currentLayers = pushLayerARN([lambdaLayerARN], currentLayers);
      setLayers(handler, currentLayers);
    }
  }
}

export function applyExtensionLayer(region: string, handlers: FunctionInfo[], layers: LayerJSON) {
  const regionRuntimes = layers.regions[region];
  if (regionRuntimes === undefined) {
    return;
  }

  for (const handler of handlers) {
    if (handler.type === RuntimeType.UNSUPPORTED) {
      continue;
    }
    const { architecture, runtime } = handler;
    let extensionLayerARN: string | undefined;
    let extensionLayerKey: string = "extension";

    if (architecture === "arm64" && runtime && runtime in armKeys) {
      removePreviousLayer(handler, regionRuntimes[extensionLayerKey]);
      extensionLayerKey = armKeys[extensionLayerKey];
    }

    extensionLayerARN = regionRuntimes[extensionLayerKey];
    let currentLayers = getLayers(handler);
    if (extensionLayerARN) {
      currentLayers = pushLayerARN([extensionLayerARN], currentLayers);
      setLayers(handler, currentLayers);
    }
  }
}

export function pushLayerARN(layerARNs: string[], currentLayers: string[]) {
  for (const layerARN of layerARNs) {
    if (!new Set(currentLayers).has(layerARN)) {
      currentLayers.push(layerARN);
    }
  }
  return currentLayers;
}

export function isFunctionDefinitionHandler(funcDef: FunctionDefinition): funcDef is FunctionDefinitionHandler {
  return typeof (funcDef as any).handler === "string";
}

function getLayers(handler: FunctionInfo) {
  const layersList = (handler.handler as any).layers as string[] | undefined;
  if (layersList === undefined) {
    return [];
  }
  return layersList;
}

function removePreviousLayer(handler: FunctionInfo, previousLayer: string | undefined) {
  let layersList = getLayers(handler);
  if (new Set(layersList).has(previousLayer!)) {
    layersList = layersList?.filter((layer) => layer !== previousLayer);
  }
  setLayers(handler, layersList);
}

function setLayers(handler: FunctionInfo, layers: string[]) {
  (handler.handler as any).layers = layers;
}
