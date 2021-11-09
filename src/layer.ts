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
  handler: ExtendedFunctionDefinition;
  runtime?: string;
}

export const X86_64_ARCHITECTURE = "x86_64";
export const ARM64_ARCHITECTURE = "arm64";
export const DEFAULT_ARCHITECTURE = X86_64_ARCHITECTURE;

// Separate interface since DefinitelyTyped currently doesn't include tags or env
export interface ExtendedFunctionDefinition extends FunctionDefinition {
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

export function applyLambdaLibraryLayers(service: Service, handlers: FunctionInfo[], layers: LayerJSON) {
  const { region } = service.provider;
  const regionRuntimes = layers.regions[region];
  if (regionRuntimes === undefined) {
    return;
  }

  for (const handler of handlers) {
    if (handler.type === RuntimeType.UNSUPPORTED) {
      continue;
    }

    const { runtime } = handler;
    const architecture =
      (handler.handler as any).architecture ?? (service.provider as any).architecture ?? DEFAULT_ARCHITECTURE;
    let runtimeKey: string | undefined = runtime;
    if (architecture === ARM64_ARCHITECTURE && runtime && runtime in armKeys) {
      runtimeKey = armKeys[runtime];
      removePreviousLayer(service, handler, regionRuntimes[runtime]);
    }

    const lambdaLayerARN = runtimeKey !== undefined ? regionRuntimes[runtimeKey] : undefined;
    if (lambdaLayerARN) {
      addLayer(service, handler, lambdaLayerARN);
    }
  }
}

export function applyExtensionLayer(service: Service, handlers: FunctionInfo[], layers: LayerJSON) {
  const { region } = service.provider;
  const regionRuntimes = layers.regions[region];
  if (regionRuntimes === undefined) {
    return;
  }

  for (const handler of handlers) {
    if (handler.type === RuntimeType.UNSUPPORTED) {
      continue;
    }
    const { runtime } = handler;
    const architecture =
      (handler.handler as any).architecture ?? (service.provider as any).architecture ?? DEFAULT_ARCHITECTURE;
    let extensionLayerARN: string | undefined;
    let extensionLayerKey: string = "extension";

    if (architecture === ARM64_ARCHITECTURE && runtime && runtime in armKeys) {
      removePreviousLayer(service, handler, regionRuntimes[extensionLayerKey]);
      extensionLayerKey = armKeys[extensionLayerKey];
    }

    extensionLayerARN = regionRuntimes[extensionLayerKey];
    if (extensionLayerARN) {
      addLayer(service, handler, extensionLayerARN);
    }
  }
}

export function pushLayerARN(layerARN: string, currentLayers: string[]): string[] {
  const layerSet = new Set(currentLayers);
  layerSet.add(layerARN);
  return Array.from(layerSet);
}

export function isFunctionDefinitionHandler(funcDef: FunctionDefinition): funcDef is FunctionDefinitionHandler {
  return typeof (funcDef as any).handler === "string";
}

function addLayer(service: Service, handler: FunctionInfo, layerArn: string) {
  setLayers(handler, pushLayerARN(layerArn, getLayers(service, handler)));
}

function getLayers(service: Service, handler: FunctionInfo) {
  const functionLayersList = ((handler.handler as any).layers as string[] | string[]) || [];
  const serviceLayersList = ((service.provider as any).layers as string[] | string[]) || [];
  // Function-level layers override service-level layers
  // Append to the function-level layers if other function-level layers are present
  // If service-level layers are present
  // Set them at the function level, as our layers are runtime-dependent and could vary
  // between functions in the same project
  if (functionLayersList.length > 0 || serviceLayersList.length === 0) {
    return functionLayersList;
  } else {
    return serviceLayersList;
  }
}

function removePreviousLayer(service: Service, handler: FunctionInfo, previousLayer: string | undefined) {
  let layersList = getLayers(service, handler);
  if (new Set(layersList).has(previousLayer!)) {
    layersList = layersList?.filter((layer) => layer !== previousLayer);
  }
  setLayers(handler, layersList);
}

function setLayers(handler: FunctionInfo, layers: string[]) {
  (handler.handler as any).layers = layers;
}
