/*
 * Unless explicitly stated otherwise all files in this repository are licensed
 * under the Apache License Version 2.0.
 *
 * This product includes software developed at Datadog (https://www.datadoghq.com/).
 * Copyright 2019 Datadog, Inc.
 */

import {
  FunctionInfo,
  LayerJSON,
  RuntimeType,
  applyLambdaLibraryLayers,
  applyExtensionLayer,
  findHandlers,
  pushLayerARN,
} from "./layer";

import { FunctionDefinition, FunctionDefinitionHandler, FunctionDefinitionImage } from "serverless";
import Service from "serverless/classes/Service";

type FunctionDefinitionAll = FunctionDefinitionHandler | FunctionDefinitionImage;

function createMockService(
  region: string,
  funcs: { [funcName: string]: Partial<FunctionDefinitionAll> },
  plugins?: string[],
): Service {
  const service: Partial<Service> & { functions: any; plugins: any } = {
    provider: { region } as any,
    getAllFunctionsNames: () => Object.keys(funcs),
    getFunction: (name) => funcs[name] as FunctionDefinitionAll,
    functions: funcs as any,
    plugins,
  };
  return service as Service;
}

describe("findHandlers", () => {
  it("finds all node and python layers with matching layers", () => {
    const mockService = createMockService("us-east-1", {
      "func-a": { handler: "myfile.handler", runtime: "nodejs8.10" },
      "func-b": { handler: "myfile.handler", runtime: "go1.10" },
      "func-c": { handler: "myfile.handler", runtime: "nodejs10.x" },
      "func-d": { handler: "myfile.handler", runtime: "python2.7" },
      "func-e": { handler: "myfile.handler", runtime: "python3.6" },
      "func-f": { handler: "myfile.handler", runtime: "python3.7" },
      "func-g": { handler: "myfile.handler", runtime: "python3.8" },
      "func-h": { handler: "myfile.handler", runtime: "nodejs12.x" },
      "func-i": { handler: "myfile.handler", runtime: "nodejs14.x" },
    });

    const result = findHandlers(mockService, []);
    expect(result).toMatchObject([
      {
        handler: { handler: "myfile.handler", runtime: "nodejs8.10" },
        type: RuntimeType.NODE,
        runtime: "nodejs8.10",
      },
      {
        handler: { handler: "myfile.handler", runtime: "go1.10" },
        type: RuntimeType.UNSUPPORTED,
        runtime: "go1.10",
      },
      {
        handler: { handler: "myfile.handler", runtime: "nodejs10.x" },
        type: RuntimeType.NODE,
        runtime: "nodejs10.x",
      },
      {
        handler: { handler: "myfile.handler", runtime: "python2.7" },
        type: RuntimeType.PYTHON,
        runtime: "python2.7",
      },
      {
        handler: { handler: "myfile.handler", runtime: "python3.6" },
        type: RuntimeType.PYTHON,
        runtime: "python3.6",
      },
      {
        handler: { handler: "myfile.handler", runtime: "python3.7" },
        type: RuntimeType.PYTHON,
        runtime: "python3.7",
      },
      {
        handler: { handler: "myfile.handler", runtime: "python3.8" },
        type: RuntimeType.PYTHON,
        runtime: "python3.8",
      },
      {
        handler: { runtime: "nodejs12.x" },
        type: RuntimeType.NODE,
        runtime: "nodejs12.x",
      },
      {
        handler: { runtime: "nodejs14.x" },
        type: RuntimeType.NODE,
        runtime: "nodejs14.x",
      },
    ]);
  });

  it("uses regular node runtime", () => {
    const mockService = createMockService("us-east-1", {
      "func-a": { handler: "myfile.handler" },
    });
    const result = findHandlers(mockService, [], "nodejs8.10");
    expect(result).toMatchObject([
      {
        handler: {},
        type: RuntimeType.NODE,
        runtime: "nodejs8.10",
      },
    ]);
  });
});

describe("applyLambdaLibraryLayers", () => {
  it("adds a layer array if none are present", () => {
    const handler = {
      handler: { runtime: "nodejs10.x" },
      type: RuntimeType.NODE,
      runtime: "nodejs10.x",
    } as FunctionInfo;
    const layers: LayerJSON = {
      regions: { "us-east-1": { "nodejs10.x": "node:2" } },
    };
    applyLambdaLibraryLayers("us-east-1", [handler], layers);
    expect(handler.handler).toEqual({
      runtime: "nodejs10.x",
      layers: ["node:2"],
    });
  });

  it("appends to the layer array if already present", () => {
    const handler = {
      handler: { runtime: "nodejs10.x", layers: ["node:1"] } as any,
      type: RuntimeType.NODE,
      runtime: "nodejs10.x",
    } as FunctionInfo;
    const layers: LayerJSON = {
      regions: { "us-east-1": { "nodejs10.x": "node:2" } },
    };
    applyLambdaLibraryLayers("us-east-1", [handler], layers);
    expect(handler.handler).toEqual({
      runtime: "nodejs10.x",
      layers: ["node:1", "node:2"],
    });
  });

  it("doesn't add duplicate layers", () => {
    const handler = {
      handler: { runtime: "nodejs10.x", layers: ["node:1"] } as any,
      type: RuntimeType.NODE,
      runtime: "nodejs10.x",
    } as FunctionInfo;
    const layers: LayerJSON = {
      regions: { "us-east-1": { "nodejs10.x": "node:1" } },
    };
    applyLambdaLibraryLayers("us-east-1", [handler], layers);
    expect(handler.handler).toEqual({
      runtime: "nodejs10.x",
      layers: ["node:1"],
    });
  });

  it("only adds layer when region can be found", () => {
    const handler = {
      handler: { runtime: "nodejs10.x" } as any,
      type: RuntimeType.NODE,
      runtime: "nodejs10.x",
    } as FunctionInfo;
    const layers: LayerJSON = {
      regions: { "us-east-1": { "nodejs10.x": "node:1" } },
    };
    applyLambdaLibraryLayers("us-east-2", [handler], layers);
    expect(handler.handler).toEqual({
      runtime: "nodejs10.x",
    });
  });

  it("only adds layer when layer ARN can be found", () => {
    const handler = {
      handler: { runtime: "nodejs10.x" } as any,
      type: RuntimeType.NODE,
      runtime: "nodejs10.x",
    } as FunctionInfo;
    const layers: LayerJSON = {
      regions: { "us-east-1": { "python2.7": "python:2" } },
    };
    applyLambdaLibraryLayers("us-east-1", [handler], layers);
    expect(handler.handler).toEqual({
      runtime: "nodejs10.x",
    });
  });

  it("only adds layer when runtime present", () => {
    const handler = {
      handler: {} as any,
      type: RuntimeType.NODE,
      runtime: "nodejs10.x",
    } as FunctionInfo;
    const layers: LayerJSON = {
      regions: { "us-east-1": { "python2.7": "python:2" } },
    };
    applyLambdaLibraryLayers("us-east-1", [handler], layers);
    expect(handler.handler).toEqual({});
  });

  it("only add layer when when supported runtime present", () => {
    const handler = {
      handler: {} as any,
      type: RuntimeType.UNSUPPORTED,
    } as FunctionInfo;
    const layers: LayerJSON = {
      regions: { "us-east-1": { "python2.7": "python:2" } },
    };
    applyLambdaLibraryLayers("us-east-1", [handler], layers);
    expect(handler.handler).toEqual({});
  });

  it("detects when to use the GovCloud layers", () => {
    const handler = {
      handler: { runtime: "nodejs10.x" },
      type: RuntimeType.NODE,
      runtime: "nodejs10.x",
    } as FunctionInfo;
    const layers: LayerJSON = {
      regions: {
        "us-gov-east-1": {
          "nodejs10.x": "arn:aws-us-gov:lambda:us-gov-east-1:002406178527:layer:Datadog-Node10-x:30",
        },
      },
    };
    applyLambdaLibraryLayers("us-gov-east-1", [handler], layers);
    expect(handler.handler).toEqual({
      runtime: "nodejs10.x",
      layers: ["arn:aws-us-gov:lambda:us-gov-east-1:002406178527:layer:Datadog-Node10-x:30"],
    });
  });

  it("adds extension layer", () => {
    const handler = {
      handler: { runtime: "nodejs10.x" },
      type: RuntimeType.NODE,
      runtime: "nodejs10.x",
    } as FunctionInfo;
    const layers: LayerJSON = {
      regions: { "us-east-1": { extension: "extension:5" } },
    };
    applyExtensionLayer("us-east-1", [handler], layers);
    expect(handler.handler).toEqual({
      runtime: "nodejs10.x",
      layers: ["extension:5"],
    });
  });

  it("adds a Lambda library and Extension layer", () => {
    const handler = {
      handler: { runtime: "nodejs10.x" },
      type: RuntimeType.NODE,
      runtime: "nodejs10.x",
    } as FunctionInfo;
    const layers: LayerJSON = {
      regions: { "us-east-1": { "nodejs10.x": "node:2", extension: "extension:5" } },
    };
    applyLambdaLibraryLayers("us-east-1", [handler], layers);
    applyExtensionLayer("us-east-1", [handler], layers);
    expect(handler.handler).toEqual({
      runtime: "nodejs10.x",
      layers: ["node:2", "extension:5"],
    });
  });
});

describe("pushLayerARN", () => {
  it("pushes two layers", () => {
    const layerARNs: string[] = ["node:2", "extension:5"];
    let currentLayers: string[] = [];
    currentLayers = pushLayerARN(layerARNs, currentLayers);
    expect(currentLayers).toEqual(["node:2", "extension:5"]);
  });

  it("appends a layer", () => {
    const layerARNs: string[] = ["extension:5"];
    let currentLayers: string[] = ["node:2"];
    currentLayers = pushLayerARN(layerARNs, currentLayers);
    expect(currentLayers).toEqual(["node:2", "extension:5"]);
  });

  it("does not re-append an existing layer", () => {
    const layerARNs: string[] = ["extension:5"];
    let currentLayers: string[] = ["extension:5"];
    currentLayers = pushLayerARN(layerARNs, currentLayers);
    expect(currentLayers).toEqual(["extension:5"]);
  });
});
