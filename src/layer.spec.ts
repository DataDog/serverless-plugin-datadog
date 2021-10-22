/*
 * Unless explicitly stated otherwise all files in this repository are licensed
 * under the Apache License Version 2.0.
 *
 * This product includes software developed at Datadog (https://www.datadoghq.com/).
 * Copyright 2021 Datadog, Inc.
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

import { FunctionDefinitionHandler, FunctionDefinitionImage } from "serverless";
import Service from "serverless/classes/Service";

type FunctionDefinitionAll = FunctionDefinitionHandler | FunctionDefinitionImage;

function createMockService(
  region: string,
  funcs: { [funcName: string]: Partial<FunctionDefinitionAll> },
  architecture?: string,
  plugins?: string[],
  layers?: string[],
): Service {
  const service: Partial<Service> & { functions: any; plugins: any } = {
    provider: { region, layers, architecture } as any,
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
      "go-function": { handler: "myfile.handler", runtime: "go1.10" },
      "node10-function": { handler: "myfile.handler", runtime: "nodejs10.x" },
      "node12-function": { handler: "myfile.handler", runtime: "nodejs12.x" },
      "node14-function": { handler: "myfile.handler", runtime: "nodejs14.x" },
      "python27-function": { handler: "myfile.handler", runtime: "python2.7" },
      "python36-function": { handler: "myfile.handler", runtime: "python3.6" },
      "python37-function": { handler: "myfile.handler", runtime: "python3.7" },
      "python38-function": { handler: "myfile.handler", runtime: "python3.8" },
      "python39-function": { handler: "myfile.handler", runtime: "python3.9" },
    });

    const result = findHandlers(mockService, []);
    expect(result).toEqual([
      {
        name: "go-function",
        handler: { handler: "myfile.handler", runtime: "go1.10" },
        type: RuntimeType.UNSUPPORTED,
        runtime: "go1.10",
      },
      {
        name: "node10-function",
        handler: { handler: "myfile.handler", runtime: "nodejs10.x" },
        type: RuntimeType.NODE,
        runtime: "nodejs10.x",
      },
      {
        name: "node12-function",
        handler: { handler: "myfile.handler", runtime: "nodejs12.x" },
        type: RuntimeType.NODE,
        runtime: "nodejs12.x",
      },
      {
        name: "node14-function",
        handler: { handler: "myfile.handler", runtime: "nodejs14.x" },
        type: RuntimeType.NODE,
        runtime: "nodejs14.x",
      },
      {
        name: "python27-function",
        handler: { handler: "myfile.handler", runtime: "python2.7" },
        type: RuntimeType.PYTHON,
        runtime: "python2.7",
      },
      {
        name: "python36-function",
        handler: { handler: "myfile.handler", runtime: "python3.6" },
        type: RuntimeType.PYTHON,
        runtime: "python3.6",
      },
      {
        name: "python37-function",
        handler: { handler: "myfile.handler", runtime: "python3.7" },
        type: RuntimeType.PYTHON,
        runtime: "python3.7",
      },
      {
        name: "python38-function",
        handler: { handler: "myfile.handler", runtime: "python3.8" },
        type: RuntimeType.PYTHON,
        runtime: "python3.8",
      },
      {
        name: "python39-function",
        handler: { handler: "myfile.handler", runtime: "python3.9" },
        type: RuntimeType.PYTHON,
        runtime: "python3.9",
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
    const mockService = createMockService("us-east-1", {
      "node-function": { handler: "myfile.handler", runtime: "nodejs10.x" },
    });
    applyLambdaLibraryLayers(mockService, [handler], layers);
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
    const mockService = createMockService("us-east-1", {
      "node-function": { handler: "myfile.handler", runtime: "nodejs10.x" },
    });
    applyLambdaLibraryLayers(mockService, [handler], layers);
    expect(handler.handler).toEqual({
      runtime: "nodejs10.x",
      layers: ["node:1", "node:2"],
    });
  });

  it("appends to the layer array if already present at provider level", () => {
    const handler = {
      handler: { runtime: "nodejs10.x", layers: ["node:1"] } as any,
      type: RuntimeType.NODE,
      runtime: "nodejs10.x",
    } as FunctionInfo;
    const layers: LayerJSON = {
      regions: { "us-east-1": { "nodejs10.x": "node:2" } },
    };
    const mockService = createMockService(
      "us-east-1",
      {
        "node-function": { handler: "myfile.handler", runtime: "nodejs10.x" },
      },
      "x86_64",
      [],
      ["my-layer-1", "my-layer-2"],
    );
    applyLambdaLibraryLayers(mockService, [handler], layers);
    expect(handler.handler).toEqual({
      runtime: "nodejs10.x",
      layers: ["my-layer-1", "my-layer-2", "node:1", "node:2"],
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
    const mockService = createMockService("us-east-1", {
      "node-function": { handler: "myfile.handler", runtime: "nodejs10.x" },
    });
    applyLambdaLibraryLayers(mockService, [handler], layers);
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
    const mockService = createMockService("us-east-2", {
      "node-function": { handler: "myfile.handler", runtime: "nodejs10.x" },
    });
    applyLambdaLibraryLayers(mockService, [handler], layers);
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
    const mockService = createMockService("us-east-1", {
      "node-function": { handler: "myfile.handler", runtime: "nodejs10.x" },
    });
    applyLambdaLibraryLayers(mockService, [handler], layers);
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
    const mockService = createMockService("us-east-1", {
      "node-function": { handler: "myfile.handler", runtime: "nodejs10.x" },
    });
    applyLambdaLibraryLayers(mockService, [handler], layers);
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
    const mockService = createMockService("us-east-1", {
      "node-function": { handler: "myfile.handler", runtime: "nodejs10.x" },
    });
    applyLambdaLibraryLayers(mockService, [handler], layers);
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
    const mockService = createMockService("us-gov-east-1", {
      "node-function": { handler: "myfile.handler", runtime: "nodejs10.x" },
    });
    applyLambdaLibraryLayers(mockService, [handler], layers);
    expect(handler.handler).toEqual({
      runtime: "nodejs10.x",
      layers: ["arn:aws-us-gov:lambda:us-gov-east-1:002406178527:layer:Datadog-Node10-x:30"],
    });
  });

  it("detects when to use the GovCloud layers with arm architecture", () => {
    const handler = {
      handler: { runtime: "python3.9" },
      type: RuntimeType.PYTHON,
      runtime: "python3.9",
    } as FunctionInfo;
    const layers: LayerJSON = {
      regions: {
        "us-gov-east-1": {
          "python3.9": "python:3.9",
          "python3.9-arm": "arn:aws-us-gov:lambda:us-gov-east-1:002406178527:layer:Datadog-Python39-ARM:49",
          extension: "extension:11",
          "extension-arm": "extension-arm:11",
        },
      },
    };
    const mockService = createMockService(
      "us-gov-east-1",
      {
        "python-function": { handler: "myfile.handler", runtime: "python3.9" },
      },
      "arm64",
    );
    applyLambdaLibraryLayers(mockService, [handler], layers);
    expect(handler.handler).toEqual({
      runtime: "python3.9",
      layers: ["arn:aws-us-gov:lambda:us-gov-east-1:002406178527:layer:Datadog-Python39-ARM:49"],
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
    const mockService = createMockService("us-east-1", {
      "node-function": { handler: "myfile.handler", runtime: "nodejs10.x" },
    });
    applyExtensionLayer(mockService, [handler], layers);
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
    const mockService = createMockService("us-east-1", {
      "node-function": { handler: "myfile.handler", runtime: "nodejs10.x" },
    });
    applyLambdaLibraryLayers(mockService, [handler], layers);
    applyExtensionLayer(mockService, [handler], layers);
    expect(handler.handler).toEqual({
      runtime: "nodejs10.x",
      layers: ["node:2", "extension:5"],
    });
  });

  it("adds correct lambda layer given architecture in function level", () => {
    const handler = {
      handler: { runtime: "python3.9", architecture: "arm64" },
      type: RuntimeType.PYTHON,
      runtime: "python3.9",
    } as FunctionInfo;
    const layers: LayerJSON = {
      regions: {
        "us-east-1": {
          "python3.9": "python:3.9",
          "python3.9-arm": "python-arm:3.9",
          extension: "extension:11",
          "extension-arm": "extension-arm:11",
        },
      },
    };
    const mockService = createMockService(
      "us-east-1",
      {
        "python-function": { handler: "myfile.handler", runtime: "python3.9" },
      },
      "arm64",
    );
    applyLambdaLibraryLayers(mockService, [handler], layers);
    applyExtensionLayer(mockService, [handler], layers);
    expect(handler.handler).toEqual({
      architecture: "arm64",
      runtime: "python3.9",
      layers: ["python-arm:3.9", "extension-arm:11"],
    });
  });

  it("adds correct lambda layer given architecture in provider level", () => {
    const handler = {
      handler: { runtime: "python3.9" },
      type: RuntimeType.PYTHON,
      runtime: "python3.9",
    } as FunctionInfo;
    const layers: LayerJSON = {
      regions: {
        "us-east-1": {
          "python3.9": "python:3.9",
          "python3.9-arm": "python-arm:3.9",
          extension: "extension:11",
          "extension-arm": "extension-arm:11",
        },
      },
    };
    const mockService = createMockService(
      "us-east-1",
      {
        "python-function": { handler: "myfile.handler", runtime: "python3.9" },
      },
      "arm64",
    );
    applyLambdaLibraryLayers(mockService, [handler], layers);
    applyExtensionLayer(mockService, [handler], layers);
    expect(handler.handler).toEqual({
      runtime: "python3.9",
      layers: ["python-arm:3.9", "extension-arm:11"],
    });
  });

  it("uses default runtime layer if architecture not available for specified runtime", () => {
    const handler = {
      handler: { runtime: "python3.7", architecture: "arm64" },
      type: RuntimeType.PYTHON,
      runtime: "python3.7",
    } as FunctionInfo;
    const layers: LayerJSON = {
      regions: {
        "us-east-1": {
          "python3.7": "python:3.7",
          extension: "extension:11",
          "extension-arm": "extension-arm:11",
        },
      },
    };
    const mockService = createMockService(
      "us-east-1",
      {
        "python-function": { handler: "myfile.handler", runtime: "python3.7" },
      },
      "arm64",
    );
    applyLambdaLibraryLayers(mockService, [handler], layers);
    applyExtensionLayer(mockService, [handler], layers);
    expect(handler.handler).toEqual({
      architecture: "arm64",
      runtime: "python3.7",
      layers: ["python:3.7", "extension:11"],
    });
  });

  it("swaps previous layer when specifying arm architecture in functions", () => {
    let handler = {
      handler: { runtime: "python3.9", architecture: "arm64" },
      type: RuntimeType.PYTHON,
      runtime: "python3.9",
    } as FunctionInfo;
    (handler.handler as any).layers = ["python:3.9", "extension:11"];
    const layers: LayerJSON = {
      regions: {
        "us-east-1": {
          "python3.9": "python:3.9",
          "python3.9-arm": "python-arm:3.9",
          extension: "extension:11",
          "extension-arm": "extension-arm:11",
        },
      },
    };
    const mockService = createMockService("us-east-1", {
      "python-function": { handler: "myfile.handler", runtime: "python3.9" },
    });
    applyLambdaLibraryLayers(mockService, [handler], layers);
    applyExtensionLayer(mockService, [handler], layers);
    expect(handler.handler).toEqual({
      architecture: "arm64",
      runtime: "python3.9",
      layers: ["python-arm:3.9", "extension-arm:11"],
    });
  });

  it("swaps previous layer when specifying arm architecture in provider level", () => {
    let handler = {
      handler: { runtime: "python3.9" },
      type: RuntimeType.PYTHON,
      runtime: "python3.9",
    } as FunctionInfo;
    (handler.handler as any).layers = ["python:3.9", "extension:11"];
    const layers: LayerJSON = {
      regions: {
        "us-east-1": {
          "python3.9": "python:3.9",
          "python3.9-arm": "python-arm:3.9",
          extension: "extension:11",
          "extension-arm": "extension-arm:11",
        },
      },
    };
    const mockService = createMockService(
      "us-east-1",
      {
        "python-function": { handler: "myfile.handler", runtime: "python3.9" },
      },
      "arm64",
    );
    applyLambdaLibraryLayers(mockService, [handler], layers);
    applyExtensionLayer(mockService, [handler], layers);
    expect(handler.handler).toEqual({
      runtime: "python3.9",
      layers: ["python-arm:3.9", "extension-arm:11"],
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
