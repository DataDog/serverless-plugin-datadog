/*
 * Unless explicitly stated otherwise all files in this repository are licensed
 * under the Apache License Version 2.0.
 *
 * This product includes software developed at Datadog (https://www.datadoghq.com/).
 * Copyright 2021 Datadog, Inc.
 */
import { FunctionDefinition, FunctionDefinitionHandler } from "serverless";
import Service from "serverless/classes/Service";
import { Configuration } from "./env";
import layerCatalog from "./layers.json";

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

const US_GOV_REGION_PREFIX = "us-gov-";

// Separate interface since DefinitelyTyped currently doesn't include tags or env
export interface ExtendedFunctionDefinition extends FunctionDefinition {
  architecture?: string;
  layers?: string[];
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

type ArchitectureLayerKeys = Partial<Record<typeof X86_64_ARCHITECTURE | typeof ARM64_ARCHITECTURE, string>>;
type CatalogLayerConfiguration = { layerKeys?: ArchitectureLayerKeys };
type LayerCatalog = {
  normalizationPrefixes: Record<string, string>;
  runtimes: Record<string, CatalogLayerConfiguration & { type: RuntimeType }>;
  layerKeys: Record<string, ArchitectureLayerKeys>;
};

const catalog = layerCatalog as LayerCatalog;

export const runtimeLookup = Object.fromEntries(
  Object.entries(catalog.runtimes).map(([runtime, configuration]) => [runtime, configuration.type]),
) as Record<string, RuntimeType>;

export const ARM_RUNTIME_KEYS = Object.fromEntries(
  [...Object.values(catalog.runtimes).map(({ layerKeys }) => layerKeys), ...Object.values(catalog.layerKeys)]
    .filter(
      (layerKeys): layerKeys is Required<ArchitectureLayerKeys> =>
        layerKeys?.[X86_64_ARCHITECTURE] !== undefined && layerKeys[ARM64_ARCHITECTURE] !== undefined,
    )
    .map((layerKeys) => [layerKeys[X86_64_ARCHITECTURE], layerKeys[ARM64_ARCHITECTURE]]),
) as Record<string, string>;

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
 * Normalize the runtime in the yml to match the generated catalog keys.
 * For most runtimes the catalog key is the same as the string set in the
 * serverless.yml, but for dotnet and java it is not.
 *
 * @param runtimeSetting string set in serverless.yml ex: "dotnet6", "nodejs18.x"
 * @returns normalized runtime key
 */
export function normalizeRuntimeKey(runtimeSetting: string): string {
  return (
    Object.entries(catalog.normalizationPrefixes).find(([prefix]) => runtimeSetting.startsWith(prefix))?.[1] ??
    runtimeSetting
  );
}

/**
 * Add library layers for the given runtime and architecture
 *
 * @param service Serverless framework service
 * @param handlers Lambda functions to add layers to
 * @param layers generated layer catalog read into an object
 * @param accountId optional account ID that the layers live in - undefined
 *        unless the customer sets a value for useLayersFromAccount in yaml
 * @param isUsingExtension whether to install the Datadog Lambda Extension as a layer
 */
export function applyLambdaLibraryLayers(
  service: Service,
  handlers: FunctionInfo[],
  layers: LayerJSON,
  accountId?: string,
  isUsingExtension = true,
): void {
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
      handler.handler?.architecture ??
      (service.provider as unknown as { architecture?: string }).architecture ??
      DEFAULT_ARCHITECTURE;
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

export function applyExtensionLayer(
  service: Service,
  handlers: FunctionInfo[],
  layers: LayerJSON,
  accountId?: string,
  isFIPSEnabled: boolean = false,
): void {
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
      handler.handler.architecture ??
      (service.provider as unknown as { architecture?: string }).architecture ??
      DEFAULT_ARCHITECTURE;
    let extensionLayerKey: string = "extension";

    if (architecture === ARM64_ARCHITECTURE) {
      const prevExtensionARN =
        accountId !== undefined
          ? buildLocalLambdaLayerARN(regionRuntimes[extensionLayerKey], accountId, region)
          : regionRuntimes[extensionLayerKey];
      removePreviousLayer(service, handler, prevExtensionARN);
      extensionLayerKey = ARM_RUNTIME_KEYS[extensionLayerKey];
    }

    if (isFIPSEnabled) {
      extensionLayerKey += "-fips";
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
  return typeof (funcDef as unknown as Record<string, unknown>).handler === "string";
}

/**
 * The isFIPSEnabled flag defaults to `true` if `addExtension` is `true` and region
 * starts with "us-gov-". It defaults to `false` otherwise.
 */
export function getDefaultIsFIPSEnabledFlag(config: Configuration, region: string): boolean {
  return config.addExtension && region.startsWith(US_GOV_REGION_PREFIX);
}

function addLayer(service: Service, handler: FunctionInfo, layerArn: string): void {
  setLayers(handler, pushLayerARN(layerArn, getLayers(service, handler)));
}

function getLayers(service: Service, handler: FunctionInfo): string[] {
  const functionLayersList = handler.handler.layers ?? [];
  const serviceLayersList = (service.provider as unknown as { layers?: string[] }).layers ?? [];
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

function removePreviousLayer(service: Service, handler: FunctionInfo, previousLayer: string | undefined): void {
  let layersList = getLayers(service, handler);
  if (new Set(layersList).has(previousLayer!)) {
    layersList = layersList?.filter((layer) => layer !== previousLayer);
  }
  setLayers(handler, layersList);
}

function setLayers(handler: FunctionInfo, layers: string[]): void {
  handler.handler.layers = layers;
}

function buildLocalLambdaLayerARN(layerARN: string | undefined, accountId: string, region: string): string | undefined {
  if (layerARN === undefined) {
    return;
  }
  // Rebuild the layer ARN to use the given account's region and partition
  const [layerName, layerVersion] = layerARN.split(":").slice(6, 8);
  const partition = getAwsPartitionByRegion(region);
  const localLayerARN = `arn:${partition}:lambda:${region}:${accountId}:layer:${layerName}:${layerVersion}`;
  return localLayerARN;
}

function getAwsPartitionByRegion(region: string): string {
  if (region.startsWith(US_GOV_REGION_PREFIX)) {
    return "aws-us-gov";
  }
  if (region.startsWith("cn-")) {
    return "aws-cn";
  }
  return "aws";
}
