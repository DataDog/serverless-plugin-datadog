import Service from "serverless/classes/Service";
import { FunctionDefinition } from "serverless";

export enum RuntimeType {
  NODE,
  PYTHON,
}

export interface HandlerInfo {
  name: string;
  type: RuntimeType;
  handler: FunctionDefinition;
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
  "nodejs8.10": RuntimeType.NODE,
  "nodejs10.x": RuntimeType.NODE,
  "python2.7": RuntimeType.PYTHON,
  "python3.6": RuntimeType.PYTHON,
  "python3.7": RuntimeType.PYTHON,
};

export function findHandlers(service: Service): HandlerInfo[] {
  const funcs = (service as any).functions as { [key: string]: FunctionDefinition };

  return Object.entries(funcs)
    .map(([name, handler]) => {
      const { runtime } = handler;
      if (runtime !== undefined && runtime in runtimeLookup) {
        return { type: runtimeLookup[runtime], name, handler } as HandlerInfo;
      }
      return undefined;
    })
    .filter((result) => result !== undefined) as HandlerInfo[];
}

export function applyLayers(region: string, handlers: HandlerInfo[], layers: LayerJSON) {
  const regionRuntimes = layers.regions[region];
  if (regionRuntimes === undefined) {
    return;
  }

  for (const handler of handlers) {
    const { runtime } = handler.handler;
    const layerARN = runtime != undefined ? regionRuntimes[runtime] : undefined;
    if (layerARN !== undefined) {
      const layers = getLayers(handler);
      if (!new Set(layers).has(layerARN)) {
        layers.push(layerARN);
      }
      setLayers(handler, layers);
    }
  }
}

function getLayers(handler: HandlerInfo) {
  const layersList = (handler.handler as any)["layers"] as string[] | undefined;
  if (layersList === undefined) {
    return [];
  }
  return layersList;
}

function setLayers(handler: HandlerInfo, layers: string[]) {
  (handler.handler as any).layers = layers;
}
