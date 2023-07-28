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
  NODE = "node",
  PYTHON = "python",
  DOTNET = "dotnet",
  CUSTOM = "custom",
  JAVA = "java",
  RUBY = "ruby",
  GO = "go",
  UNSUPPORTED = "unsupported",
}

export interface FunctionInfo {
  name: string;
  type: RuntimeType;
  handler: ExtendedFunctionDefinition;
  runtime?: string;
}

const X86_64_ARCHITECTURE = "x86_64";
const ARM64_ARCHITECTURE = "arm64";
const DEFAULT_ARCHITECTURE = X86_64_ARCHITECTURE;

const DEFAULT_REGION = "us-east-1";

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
  "nodejs12.x": RuntimeType.NODE,
  "nodejs14.x": RuntimeType.NODE,
  "nodejs16.x": RuntimeType.NODE,
  "nodejs18.x": RuntimeType.NODE,
  "python3.7": RuntimeType.PYTHON,
  "python3.8": RuntimeType.PYTHON,
  "python3.9": RuntimeType.PYTHON,
  "python3.10": RuntimeType.PYTHON,
  "python3.11": RuntimeType.PYTHON,
  "dotnetcore3.1": RuntimeType.DOTNET,
  dotnet6: RuntimeType.DOTNET,
  java11: RuntimeType.JAVA,
  java17: RuntimeType.JAVA,
  "java8.al2": RuntimeType.JAVA,
  java8: RuntimeType.JAVA,
  "provided.al2": RuntimeType.CUSTOM,
  provided: RuntimeType.CUSTOM,
  "ruby2.7": RuntimeType.RUBY,
  "ruby3.2": RuntimeType.RUBY,
  "go1.x": RuntimeType.GO,
};

export const armRuntimeKeys: { [key: string]: string } = {
  "python3.8": "python3.8-arm",
  "python3.9": "python3.9-arm",
  "python3.10": "python3.10-arm",
  "python3.11": "python3.11-arm",
  "ruby2.7": "ruby2.7-arm",
  "ruby3.2": "ruby3.2-arm",
  extension: "extension-arm",
  dotnet6: "dd-trace-dotnet-ARM",
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

export function applyLambdaLibraryLayers(
  service: Service,
  handlers: FunctionInfo[],
  layers: LayerJSON,
  accountId?: string,
) {
  const { region } = service.provider;
  // It's possible a local account layer is being used in a region we have not published to so we use a default region's ARNs
  const shouldUseDefaultRegion = layers.regions[region] === undefined && accountId !== undefined;
  const regionRuntimes = shouldUseDefaultRegion ? layers.regions[DEFAULT_REGION] : layers.regions[region];
  if (regionRuntimes === undefined) {
    return;
  }

  for (const handler of handlers) {
    if (handler.type === RuntimeType.UNSUPPORTED) {
      continue;
    }

    const { runtime } = handler;
    if (runtime === undefined) {
      continue;
    }

    let runtimeKey = runtime;
    const architecture =
      handler.handler?.architecture ?? (service.provider as any).architecture ?? DEFAULT_ARCHITECTURE;
    const isArm64 = architecture === ARM64_ARCHITECTURE;
    if (isArm64 && runtime in armRuntimeKeys) {
      runtimeKey = armRuntimeKeys[runtime];
      const prevLayerARN =
        accountId !== undefined
          ? buildLocalLambdaLayerARN(regionRuntimes[runtime], accountId, region)
          : regionRuntimes[runtime];
      removePreviousLayer(service, handler, prevLayerARN);
    }

    let layerARN = regionRuntimes[runtimeKey];
    if (accountId && layerARN) {
      layerARN = buildLocalLambdaLayerARN(layerARN, accountId, region);
    }

    if (layerARN) {
      addLayer(service, handler, layerARN);
    }
  }
}

export function applyExtensionLayer(service: Service, handlers: FunctionInfo[], layers: LayerJSON, accountId?: string) {
  const { region } = service.provider;
  // It's possible a local account layer is being used in a region we have not published to so we use a default region's ARNs
  const shouldUseDefaultRegion = layers.regions[region] === undefined && accountId !== undefined;
  const regionRuntimes = shouldUseDefaultRegion ? layers.regions[DEFAULT_REGION] : layers.regions[region];
  if (regionRuntimes === undefined) {
    return;
  }

  for (const handler of handlers) {
    if (handler.type === RuntimeType.UNSUPPORTED) {
      continue;
    }
    const architecture =
      (handler.handler as any).architecture ?? (service.provider as any).architecture ?? DEFAULT_ARCHITECTURE;
    let extensionLayerKey: string = "extension";

    if (architecture === ARM64_ARCHITECTURE) {
      const prevExtensionARN =
        accountId !== undefined
          ? buildLocalLambdaLayerARN(regionRuntimes[extensionLayerKey], accountId, region)
          : regionRuntimes[extensionLayerKey];
      removePreviousLayer(service, handler, prevExtensionARN);
      extensionLayerKey = armRuntimeKeys[extensionLayerKey];
    }

    let extensionARN = regionRuntimes[extensionLayerKey];
    if (accountId && extensionARN) {
      extensionARN = buildLocalLambdaLayerARN(extensionARN, accountId, region);
    }

    if (extensionARN) {
      addLayer(service, handler, extensionARN);
    }
  }
}

export function applyTracingLayer(
  service: Service,
  handler: FunctionInfo,
  layers: LayerJSON,
  runtimeKey: string,
  accountId?: string,
) {
  const { region } = service.provider;
  // It's possible a local account layer is being used in a region we have not published to so we use a default region's ARNs
  const shouldUseDefaultRegion = layers.regions[region] === undefined && accountId !== undefined;
  const regionRuntimes = shouldUseDefaultRegion ? layers.regions[DEFAULT_REGION] : layers.regions[region];
  if (regionRuntimes === undefined) {
    return;
  }

  let traceLayerARN: string | undefined = regionRuntimes[runtimeKey];
  if (accountId && traceLayerARN) {
    traceLayerARN = buildLocalLambdaLayerARN(traceLayerARN, accountId, region);
  }

  if (traceLayerARN) {
    addLayer(service, handler, traceLayerARN);
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

function buildLocalLambdaLayerARN(layerARN: string | undefined, accountId: string, region: string) {
  if (layerARN === undefined) {
    return;
  }
  // Rebuild the layer ARN to use the given account's region and partition
  const [layerName, layerVersion] = layerARN.split(":").slice(6, 8);
  const partition = getAwsPartitionByRegion(region);
  const localLayerARN = `arn:${partition}:lambda:${region}:${accountId}:layer:${layerName}:${layerVersion}`;
  return localLayerARN;
}

function getAwsPartitionByRegion(region: string) {
  if (region.startsWith("us-gov-")) {
    return "aws-us-gov";
  }
  if (region.startsWith("cn-")) {
    return "aws-cn";
  }
  return "aws";
}
