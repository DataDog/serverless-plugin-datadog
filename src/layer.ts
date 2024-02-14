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

// .NET can only be used with the extension and Java requires
// some code changes
const RUNTIMES_TO_ADD_FOR_EXTENSION_ONLY = [RuntimeType.DOTNET, RuntimeType.JAVA];

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
  "nodejs14.x": RuntimeType.NODE,
  "nodejs16.x": RuntimeType.NODE,
  "nodejs18.x": RuntimeType.NODE,
  "nodejs20.x": RuntimeType.NODE,
  "python3.7": RuntimeType.PYTHON,
  "python3.8": RuntimeType.PYTHON,
  "python3.9": RuntimeType.PYTHON,
  "python3.10": RuntimeType.PYTHON,
  "python3.11": RuntimeType.PYTHON,
  "python3.12": RuntimeType.PYTHON,
  dotnet6: RuntimeType.DOTNET,
  java11: RuntimeType.JAVA,
  java17: RuntimeType.JAVA,
  java21: RuntimeType.JAVA,
  "java8.al2": RuntimeType.JAVA,
  java8: RuntimeType.JAVA,
  "provided.al2": RuntimeType.CUSTOM,
  provided: RuntimeType.CUSTOM,
  "ruby3.2": RuntimeType.RUBY,
  "go1.x": RuntimeType.GO,
};

// Map from x86 runtime keys in layers.json to the corresponding ARM runtime keys
export const ARM_RUNTIME_KEYS: { [key: string]: string } = {
  "python3.8": "python3.8-arm",
  "python3.9": "python3.9-arm",
  "python3.10": "python3.10-arm",
  "python3.11": "python3.11-arm",
  "python3.12": "python3.12-arm",
  "ruby3.2": "ruby3.2-arm",
  extension: "extension-arm",
  dotnet: "dotnet-arm",
  // The same Node layers work for both x86 and ARM
  "nodejs14.x": "nodejs14.x",
  "nodejs16.x": "nodejs16.x",
  "nodejs18.x": "nodejs18.x",
  "nodejs20.x": "nodejs20.x",
  // The same Java layer works for both x86 and ARM
  java: "java",
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

/**
 * Normalize the runtime in the yml to match our layers.json keys
 * For most runtimes the key in layers.json is the same as the string set in the
 * serverless.yml, but for dotnet and java they are not
 *
 * @param runtimeSetting string set in serverless.yml ex: "dotnet6", "nodejs18.x"
 */
export function normalizeRuntimeKey(runtimeSetting: string) {
  if (runtimeSetting.startsWith("dotnet")) {
    return "dotnet";
  }
  if (runtimeSetting.startsWith("java")) {
    return "java";
  }
  return runtimeSetting;
}

/**
 * Add library layers for the given runtime and architecture
 *
 * @param service SLS framework service
 * @param handlers Lambda functions to add layers to
 * @param layers layers.json file read into an object
 * @param accountId optional account ID that the layers live in - undefined
 *        unless the customer sets a value for useLayersFromAccount in yaml
 */
export function applyLambdaLibraryLayers(
  service: Service,
  handlers: FunctionInfo[],
  layers: LayerJSON,
  accountId?: string,
  isUsingExtension = true,
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

    if (!isUsingExtension && RUNTIMES_TO_ADD_FOR_EXTENSION_ONLY.includes(handler.type)) {
      continue;
    }

    const x86RuntimeKey = normalizeRuntimeKey(runtime);
    const armRuntimeKey = ARM_RUNTIME_KEYS[x86RuntimeKey];

    let x86LayerArn = regionRuntimes[x86RuntimeKey];
    let armLayerArn = regionRuntimes[armRuntimeKey];

    if (accountId && x86LayerArn) {
      x86LayerArn = buildLocalLambdaLayerARN(x86LayerArn, accountId, region);
    }
    if (accountId && armLayerArn) {
      armLayerArn = buildLocalLambdaLayerARN(armLayerArn, accountId, region);
    }

    const architecture =
      handler.handler?.architecture ?? (service.provider as any).architecture ?? DEFAULT_ARCHITECTURE;
    const isArm64 = architecture === ARM64_ARCHITECTURE;

    // Use the ARM layer if customer's handler is using ARM
    let layerARN = isArm64 ? armLayerArn : x86LayerArn;

    // Fall back to the x86 layer if no ARM layer is available
    if (isArm64 && layerARN === undefined) {
      layerARN = x86LayerArn;
    }

    if (accountId && layerARN) {
      layerARN = buildLocalLambdaLayerARN(layerARN, accountId, region);
    }

    if (isArm64 && layerARN !== undefined && x86LayerArn !== undefined) {
      // Remove the x86 layer if the customer is using ARM
      removePreviousLayer(service, handler, x86LayerArn);
    }
    if (!isArm64 && layerARN !== undefined && armLayerArn !== undefined) {
      // Remove the ARM layer if the customer is using x86
      removePreviousLayer(service, handler, armLayerArn);
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
      extensionLayerKey = ARM_RUNTIME_KEYS[extensionLayerKey];
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
