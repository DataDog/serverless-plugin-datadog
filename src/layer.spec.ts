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
  it("finds all runtimes with matching layers", () => {
    const mockService = createMockService("us-east-1", {
      "go-function": { handler: "myfile.handler", runtime: "go1.10" },
      "node12-function": { handler: "myfile.handler", runtime: "nodejs12.x" },
      "node14-function": { handler: "myfile.handler", runtime: "nodejs14.x" },
      "node16-function": { handler: "myfile.handler", runtime: "nodejs16.x" },
      "node18-function": { handler: "myfile.handler", runtime: "nodejs18.x" },
      "node20-function": { handler: "myfile.handler", runtime: "nodejs20.x" },
      "python37-function": { handler: "myfile.handler", runtime: "python3.7" },
      "python38-function": { handler: "myfile.handler", runtime: "python3.8" },
      "python39-function": { handler: "myfile.handler", runtime: "python3.9" },
      "python310-function": { handler: "myfile.handler", runtime: "python3.10" },
      "python311-function": { handler: "myfile.handler", runtime: "python3.11" },
      "ruby27-function": { handler: "myfile.handler", runtime: "ruby2.7" },
      "ruby32-function": { handler: "myfile.handler", runtime: "ruby3.2" },
      "java8-function": { handler: "myfile.handler", runtime: "java8" },
      "java8.al2-function": { handler: "myfile.handler", runtime: "java8.al2" },
      "java11-function": { handler: "myfile.handler", runtime: "java11" },
      "java17-function": { handler: "myfile.handler", runtime: "java17" },
      "java21-function": { handler: "myfile.handler", runtime: "java21" },
      "dotnet6-function": { handler: "myfile.handler", runtime: "dotnet6" },
      "dotnetcore3.1-function": { handler: "myfile.handler", runtime: "dotnetcore3.1" },
      "provided-function": { handler: "myfile.handler", runtime: "provided" },
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
        name: "node16-function",
        handler: { handler: "myfile.handler", runtime: "nodejs16.x" },
        type: RuntimeType.NODE,
        runtime: "nodejs16.x",
      },
      {
        name: "node18-function",
        handler: { handler: "myfile.handler", runtime: "nodejs18.x" },
        type: RuntimeType.NODE,
        runtime: "nodejs18.x",
      },
      {
        name: "node20-function",
        handler: { handler: "myfile.handler", runtime: "nodejs20.x" },
        type: RuntimeType.NODE,
        runtime: "nodejs20.x",
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
      {
        name: "python310-function",
        handler: { handler: "myfile.handler", runtime: "python3.10" },
        type: RuntimeType.PYTHON,
        runtime: "python3.10",
      },
      {
        name: "python311-function",
        handler: { handler: "myfile.handler", runtime: "python3.11" },
        type: RuntimeType.PYTHON,
        runtime: "python3.11",
      },
      {
        name: "ruby27-function",
        handler: { handler: "myfile.handler", runtime: "ruby2.7" },
        type: RuntimeType.RUBY,
        runtime: "ruby2.7",
      },
      {
        name: "ruby32-function",
        handler: { handler: "myfile.handler", runtime: "ruby3.2" },
        type: RuntimeType.RUBY,
        runtime: "ruby3.2",
      },
      {
        name: "java8-function",
        handler: { handler: "myfile.handler", runtime: "java8" },
        type: RuntimeType.JAVA,
        runtime: "java8",
      },
      {
        name: "java8.al2-function",
        handler: { handler: "myfile.handler", runtime: "java8.al2" },
        type: RuntimeType.JAVA,
        runtime: "java8.al2",
      },
      {
        name: "java11-function",
        handler: { handler: "myfile.handler", runtime: "java11" },
        type: RuntimeType.JAVA,
        runtime: "java11",
      },
      {
        name: "java17-function",
        handler: { handler: "myfile.handler", runtime: "java17" },
        type: RuntimeType.JAVA,
        runtime: "java17",
      },
      {
        name: "java21-function",
        handler: { handler: "myfile.handler", runtime: "java21" },
        type: RuntimeType.JAVA,
        runtime: "java21",
      },
      {
        name: "dotnet6-function",
        handler: { handler: "myfile.handler", runtime: "dotnet6" },
        type: RuntimeType.DOTNET,
        runtime: "dotnet6",
      },
      {
        name: "dotnetcore3.1-function",
        handler: { handler: "myfile.handler", runtime: "dotnetcore3.1" },
        type: RuntimeType.DOTNET,
        runtime: "dotnetcore3.1",
      },
      {
        name: "provided-function",
        handler: { handler: "myfile.handler", runtime: "provided" },
        type: RuntimeType.CUSTOM,
        runtime: "provided",
      },
    ]);
  });
});

describe("applyLambdaLibraryLayers", () => {
  it("adds a layer array if none are present at the function array or service.provider array", () => {
    const handler = {
      handler: { runtime: "nodejs14.x" },
      type: RuntimeType.NODE,
      runtime: "nodejs14.x",
    } as FunctionInfo;
    const layers: LayerJSON = {
      regions: { "us-east-1": { "nodejs14.x": "node:2" } },
    };
    const mockService = createMockService("us-east-1", {
      "node-function": { handler: "myfile.handler", runtime: "nodejs14.x" },
    });
    applyLambdaLibraryLayers(mockService, [handler], layers);
    expect(handler.handler).toEqual({
      runtime: "nodejs14.x",
      layers: ["node:2"],
    });
  });

  it("appends to the layer array if already present", () => {
    const handler = {
      handler: { runtime: "nodejs14.x", layers: ["node:1"] } as any,
      type: RuntimeType.NODE,
      runtime: "nodejs14.x",
    } as FunctionInfo;
    const layers: LayerJSON = {
      regions: { "us-east-1": { "nodejs14.x": "node:2" } },
    };
    const mockService = createMockService("us-east-1", {
      "node-function": { handler: "myfile.handler", runtime: "nodejs14.x" },
    });
    applyLambdaLibraryLayers(mockService, [handler], layers);
    expect(handler.handler).toEqual({
      runtime: "nodejs14.x",
      layers: ["node:1", "node:2"],
    });
  });

  it("appends to the function layer array if the function layer array is empty and the provider array has items", () => {
    const handler = {
      handler: { runtime: "nodejs14.x" } as any,
      type: RuntimeType.NODE,
      runtime: "nodejs14.x",
    } as FunctionInfo;
    const layers: LayerJSON = {
      regions: { "us-east-1": { "nodejs14.x": "node:2" } },
    };
    const mockService = createMockService(
      "us-east-1",
      {
        "node-function": { handler: "myfile.handler", runtime: "nodejs14.x" },
      },
      "x86_64",
      [],
      ["my-layer-1", "my-layer-2"],
    );
    expect(mockService.provider).toEqual({
      architecture: "x86_64",
      layers: ["my-layer-1", "my-layer-2"],
      region: "us-east-1",
    });
    applyLambdaLibraryLayers(mockService, [handler], layers);
    expect(handler.handler).toEqual({
      runtime: "nodejs14.x",
      layers: ["my-layer-1", "my-layer-2", "node:2"],
    });
    expect(mockService.provider).toEqual({
      architecture: "x86_64",
      layers: ["my-layer-1", "my-layer-2"],
      region: "us-east-1",
    });
  });

  it("appends to the function layer array if the function layer array and service.provider layer array each have items", () => {
    const handler = {
      handler: { runtime: "nodejs14.x", layers: ["my-layer-1"] } as any,
      type: RuntimeType.NODE,
      runtime: "nodejs14.x",
    } as FunctionInfo;
    const layers: LayerJSON = {
      regions: { "us-east-1": { "nodejs14.x": "node:2" } },
    };
    const mockService = createMockService(
      "us-east-1",
      {
        "node-function": { handler: "myfile.handler", runtime: "nodejs14.x" },
      },
      "x86_64",
      [],
      ["ignored-service-layer"], // Eventually this is ignored by Serverless
    );
    applyLambdaLibraryLayers(mockService, [handler], layers);
    expect(handler.handler).toEqual({
      runtime: "nodejs14.x",
      layers: ["my-layer-1", "node:2"],
    });
    expect(mockService.provider).toEqual({
      architecture: "x86_64",
      layers: ["ignored-service-layer"],
      region: "us-east-1",
    });
  });

  it("doesn't add duplicate layers", () => {
    const handler = {
      handler: { runtime: "nodejs14.x", layers: ["node:1"] } as any,
      type: RuntimeType.NODE,
      runtime: "nodejs14.x",
    } as FunctionInfo;
    const layers: LayerJSON = {
      regions: { "us-east-1": { "nodejs14.x": "node:1" } },
    };
    const mockService = createMockService("us-east-1", {
      "node-function": { handler: "myfile.handler", runtime: "nodejs14.x" },
    });
    applyLambdaLibraryLayers(mockService, [handler], layers);
    expect(handler.handler).toEqual({
      runtime: "nodejs14.x",
      layers: ["node:1"],
    });
  });

  it("only adds layer when region can be found", () => {
    const handler = {
      handler: { runtime: "nodejs14.x" } as any,
      type: RuntimeType.NODE,
      runtime: "nodejs14.x",
    } as FunctionInfo;
    const layers: LayerJSON = {
      regions: { "us-east-1": { "nodejs14.x": "node:1" } },
    };
    const mockService = createMockService("us-east-2", {
      "node-function": { handler: "myfile.handler", runtime: "nodejs14.x" },
    });
    applyLambdaLibraryLayers(mockService, [handler], layers);
    expect(handler.handler).toEqual({
      runtime: "nodejs14.x",
    });
  });

  it("only adds layer when layer ARN can be found", () => {
    const handler = {
      handler: { runtime: "nodejs14.x" } as any,
      type: RuntimeType.NODE,
      runtime: "nodejs14.x",
    } as FunctionInfo;
    const layers: LayerJSON = {
      regions: { "us-east-1": { "python3.9": "python:2" } },
    };
    const mockService = createMockService("us-east-1", {
      "node-function": { handler: "myfile.handler", runtime: "nodejs14.x" },
    });
    applyLambdaLibraryLayers(mockService, [handler], layers);
    expect(handler.handler).toEqual({
      runtime: "nodejs14.x",
    });
  });

  it("only adds layer when runtime present", () => {
    const handler = {
      handler: {} as any,
      type: RuntimeType.NODE,
      runtime: "nodejs14.x",
    } as FunctionInfo;
    const layers: LayerJSON = {
      regions: { "us-east-1": { "python3.9": "python:2" } },
    };
    const mockService = createMockService("us-east-1", {
      "node-function": { handler: "myfile.handler", runtime: "nodejs14.x" },
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
      regions: { "us-east-1": { "python3.9": "python:2" } },
    };
    const mockService = createMockService("us-east-1", {
      "node-function": { handler: "myfile.handler", runtime: "nodejs14.x" },
    });
    applyLambdaLibraryLayers(mockService, [handler], layers);
    expect(handler.handler).toEqual({});
  });

  it("detects when to use the GovCloud layers", () => {
    const handler = {
      handler: { runtime: "nodejs14.x" },
      type: RuntimeType.NODE,
      runtime: "nodejs14.x",
    } as FunctionInfo;
    const layers: LayerJSON = {
      regions: {
        "us-gov-east-1": {
          "nodejs14.x": "arn:aws-us-gov:lambda:us-gov-east-1:002406178527:layer:Datadog-Node14-x:30",
        },
      },
    };
    const mockService = createMockService("us-gov-east-1", {
      "node-function": { handler: "myfile.handler", runtime: "nodejs14.x" },
    });
    applyLambdaLibraryLayers(mockService, [handler], layers);
    expect(handler.handler).toEqual({
      runtime: "nodejs14.x",
      layers: ["arn:aws-us-gov:lambda:us-gov-east-1:002406178527:layer:Datadog-Node14-x:30"],
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
      handler: { runtime: "nodejs14.x" },
      type: RuntimeType.NODE,
      runtime: "nodejs14.x",
    } as FunctionInfo;
    const layers: LayerJSON = {
      regions: { "us-east-1": { extension: "extension:5" } },
    };
    const mockService = createMockService("us-east-1", {
      "node-function": { handler: "myfile.handler", runtime: "nodejs14.x" },
    });
    applyExtensionLayer(mockService, [handler], layers);
    expect(handler.handler).toEqual({
      runtime: "nodejs14.x",
      layers: ["extension:5"],
    });
  });

  it("adds a Lambda library and Extension layer", () => {
    const handler = {
      handler: { runtime: "nodejs14.x" },
      type: RuntimeType.NODE,
      runtime: "nodejs14.x",
    } as FunctionInfo;
    const layers: LayerJSON = {
      regions: { "us-east-1": { "nodejs14.x": "node:2", extension: "extension:5" } },
    };
    const mockService = createMockService(
      "us-east-1",
      {
        "node-function": { handler: "myfile.handler", runtime: "nodejs14.x" },
      },
      "x86_64",
      [],
      ["my-layer-1", "my-layer-2"],
    );
    applyLambdaLibraryLayers(mockService, [handler], layers);
    applyExtensionLayer(mockService, [handler], layers);
    expect(handler.handler).toEqual({
      layers: ["my-layer-1", "my-layer-2", "node:2", "extension:5"],
      runtime: "nodejs14.x",
    });
    expect(mockService.provider).toEqual({
      architecture: "x86_64",
      layers: ["my-layer-1", "my-layer-2"],
      region: "us-east-1",
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

  it("adds correct lambda layer given architecture in provider level for node", () => {
    const handler = {
      handler: { runtime: "nodejs14.x" },
      type: RuntimeType.NODE,
      runtime: "nodejs14.x",
    } as FunctionInfo;
    const layers: LayerJSON = {
      regions: {
        "us-east-1": {
          "nodejs14.x": "nodejs14.x",
          extension: "extension:11",
          "extension-arm": "extension-arm:11",
        },
      },
    };
    const mockService = createMockService(
      "us-east-1",
      {
        "node-function": { handler: "myfile.handler", runtime: "nodejs14.x" },
      },
      "arm64",
    );
    applyLambdaLibraryLayers(mockService, [handler], layers);
    applyExtensionLayer(mockService, [handler], layers);
    expect(handler.handler).toEqual({
      runtime: "nodejs14.x",
      layers: ["nodejs14.x", "extension-arm:11"],
    });
  });

  it("adds correct lambda layer given architecture in provider level for .NET", () => {
    const handler = {
      handler: { runtime: "dotnet6" },
      type: RuntimeType.DOTNET,
      runtime: "dotnet6",
    } as FunctionInfo;
    const layers: LayerJSON = {
      regions: {
        "us-east-1": {
          dotnet: "dd-trace-dotnet:6",
          "dotnet-arm": "dd-trace-dotnet-ARM:6",
          extension: "extension:11",
          "extension-arm": "extension-arm:11",
        },
      },
    };
    const mockService = createMockService(
      "us-east-1",
      {
        ".NET-function": { handler: "myfile.handler", runtime: "dotnet6" },
      },
      "arm64",
    );
    applyLambdaLibraryLayers(mockService, [handler], layers);
    applyExtensionLayer(mockService, [handler], layers);
    expect(handler.handler).toEqual({
      runtime: "dotnet6",
      layers: ["dd-trace-dotnet-ARM:6", "extension-arm:11"],
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
      layers: ["python:3.7", "extension-arm:11"],
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

  it("adds a Lambda layer from the local AWS account of the same name", () => {
    const handler = {
      handler: { runtime: "nodejs18.x" },
      type: RuntimeType.NODE,
      runtime: "nodejs18.x",
    } as FunctionInfo;
    const layers: LayerJSON = {
      regions: { "sa-east-1": { "nodejs18.x": "arn:aws:lambda:sa-east-1:464622532012:layer:Datadog-Node18-x:1" } },
    };
    const mockService = createMockService("sa-east-1", {
      "node-function": { handler: "myfile.handler", runtime: "nodejs18.x" },
    });
    const mockAccountId = "123456789012";
    const localLambdaLayerARN = "arn:aws:lambda:sa-east-1:123456789012:layer:Datadog-Node18-x:1";
    applyLambdaLibraryLayers(mockService, [handler], layers, mockAccountId);
    expect(handler.handler).toEqual({
      runtime: "nodejs18.x",
      layers: [localLambdaLayerARN],
    });
  });

  it("adds a Lambda layer from the local AWS account regardless of whether we've published to that region", () => {
    const handler = {
      handler: { runtime: "nodejs18.x" },
      type: RuntimeType.NODE,
      runtime: "nodejs18.x",
    } as FunctionInfo;
    const layers: LayerJSON = {
      regions: { "us-east-1": { "nodejs18.x": "arn:aws:lambda:us-east-1:464622532012:layer:Datadog-Node18-x:1" } },
    };
    const mockService = createMockService("cn-north-1", {
      "node-function": { handler: "myfile.handler", runtime: "nodejs18.x" },
    });
    const mockAccountId = "123456789012";
    const localLambdaLayerARN = "arn:aws-cn:lambda:cn-north-1:123456789012:layer:Datadog-Node18-x:1";
    applyLambdaLibraryLayers(mockService, [handler], layers, mockAccountId);
    expect(handler.handler).toEqual({
      runtime: "nodejs18.x",
      layers: [localLambdaLayerARN],
    });
  });

  it("adds an Extension layer from the local AWS account of the same name", () => {
    const handler = {
      handler: { runtime: "nodejs18.x" },
      type: RuntimeType.NODE,
      runtime: "nodejs18.x",
    } as FunctionInfo;
    const layers: LayerJSON = {
      regions: { "us-east-1": { extension: "arn:aws:lambda:us-east-1:464622532012:layer:Datadog-Extension:1" } },
    };
    const mockService = createMockService("sa-east-1", {
      "node-function": { handler: "myfile.handler", runtime: "nodejs18.x" },
    });
    const mockAccountId = "123456789012";
    const localExtensionARN = "arn:aws:lambda:sa-east-1:123456789012:layer:Datadog-Extension:1";
    applyExtensionLayer(mockService, [handler], layers, mockAccountId);
    expect(handler.handler).toEqual({
      runtime: "nodejs18.x",
      layers: [localExtensionARN],
    });
  });

  it("adds an Extension layer from the local AWS account regardless of whether we've published to that region", () => {
    const handler = {
      handler: { runtime: "nodejs18.x" },
      type: RuntimeType.NODE,
      runtime: "nodejs18.x",
    } as FunctionInfo;
    const layers: LayerJSON = {
      regions: { "us-east-1": { extension: "arn:aws:lambda:us-east-1:464622532012:layer:Datadog-Extension:1" } },
    };
    const mockService = createMockService("cn-northwest-1", {
      "node-function": { handler: "myfile.handler", runtime: "nodejs18.x" },
    });
    const mockAccountId = "123456789012";
    const localExtensionARN = "arn:aws-cn:lambda:cn-northwest-1:123456789012:layer:Datadog-Extension:1";
    applyExtensionLayer(mockService, [handler], layers, mockAccountId);
    expect(handler.handler).toEqual({
      runtime: "nodejs18.x",
      layers: [localExtensionARN],
    });
  });

  it("adds a tracing layer from the local AWS account of the same name", () => {
    const handler = {
      handler: { runtime: "java11" },
      type: RuntimeType.JAVA,
      runtime: "java11",
    } as FunctionInfo;
    const layers: LayerJSON = {
      regions: { "us-east-1": { java: "arn:aws:lambda:us-east-1:464622532012:layer:dd-trace-java:1" } },
    };
    const mockService = createMockService("sa-east-1", {
      "java-function": { handler: "myfile.handler", runtime: "java11" },
    });
    const mockAccountId = "123456789012";
    const localTraceLayerARN = "arn:aws:lambda:sa-east-1:123456789012:layer:dd-trace-java:1";

    applyLambdaLibraryLayers(mockService, [handler], layers, mockAccountId);
    expect(handler.handler).toEqual({
      runtime: "java11",
      layers: [localTraceLayerARN],
    });
  });

  it("adds a tracing layer from the local AWS account regardless of whether we've published to that region", () => {
    const handler = {
      handler: { runtime: "java11" },
      type: RuntimeType.JAVA,
      runtime: "java11",
    } as FunctionInfo;
    const layers: LayerJSON = {
      regions: { "us-east-1": { java: "arn:aws:lambda:us-east-1:464622532012:layer:dd-trace-java:1" } },
    };
    const mockService = createMockService("cn-northwest-1", {
      "java-function": { handler: "myfile.handler", runtime: "java11" },
    });
    const mockAccountId = "123456789012";
    const localTraceLayerARN = "arn:aws-cn:lambda:cn-northwest-1:123456789012:layer:dd-trace-java:1";

    applyLambdaLibraryLayers(mockService, [handler], layers, mockAccountId);
    expect(handler.handler).toEqual({
      runtime: "java11",
      layers: [localTraceLayerARN],
    });
  });

  it("adds the .NET ARM layer and ARM extension", () => {
    const handler = {
      handler: { runtime: "dotnet6" },
      type: RuntimeType.DOTNET,
      runtime: "dotnet6",
    } as FunctionInfo;
    const layers: LayerJSON = {
      regions: {
        "us-east-1": {
          dotnet: "arn:aws:lambda:us-east-1:464622532012:layer:dd-trace-dotnet:9",
          "dotnet-arm": "arn:aws:lambda:us-east-1:464622532012:layer:dd-trace-dotnet-ARM:9",
          extension: "arn:aws:lambda:us-east-1:464622532012:layer:Datadog-Extension:47",
          "extension-arm": "arn:aws:lambda:us-east-1:464622532012:layer:Datadog-Extension-ARM:47",
        },
      },
    };
    const mockService = createMockService(
      "us-east-1",
      {
        "dotnet-function": { handler: "AwsDotnetCsharp::AwsDotnetCsharp.Handler::HelloWorld", runtime: "dotnet6" },
      },
      "arm64",
    );
    applyLambdaLibraryLayers(mockService, [handler], layers);
    applyExtensionLayer(mockService, [handler], layers);
    expect(handler.handler).toEqual({
      runtime: "dotnet6",
      layers: [
        "arn:aws:lambda:us-east-1:464622532012:layer:dd-trace-dotnet-ARM:9",
        "arn:aws:lambda:us-east-1:464622532012:layer:Datadog-Extension-ARM:47",
      ],
    });
  });

  it("adds the .NET ARM layer and extension with account ID specified", () => {
    const handler = {
      handler: { runtime: "dotnet6" },
      type: RuntimeType.DOTNET,
      runtime: "dotnet6",
    } as FunctionInfo;
    const layers: LayerJSON = {
      regions: {
        "us-east-1": {
          dotnet: "arn:aws:lambda:us-east-1:464622532012:layer:dd-trace-dotnet:9",
          "dotnet-arm": "arn:aws:lambda:us-east-1:464622532012:layer:dd-trace-dotnet-ARM:9",
          extension: "arn:aws:lambda:us-east-1:464622532012:layer:Datadog-Extension:47",
          "extension-arm": "arn:aws:lambda:us-east-1:464622532012:layer:Datadog-Extension-ARM:47",
        },
      },
    };
    const mockService = createMockService(
      "us-east-1",
      {
        "dotnet-function": { handler: "AwsDotnetCsharp::AwsDotnetCsharp.Handler::HelloWorld", runtime: "dotnet6" },
      },
      "arm64",
    );
    const mockAccountId = "123456789012";
    applyLambdaLibraryLayers(mockService, [handler], layers, mockAccountId);
    applyExtensionLayer(mockService, [handler], layers, mockAccountId);

    expect(handler.handler).toEqual({
      runtime: "dotnet6",
      layers: [
        "arn:aws:lambda:us-east-1:123456789012:layer:dd-trace-dotnet-ARM:9",
        "arn:aws:lambda:us-east-1:123456789012:layer:Datadog-Extension-ARM:47",
      ],
    });
  });

  it("does not add the .NET ARM layer without extension", () => {
    const handler = {
      handler: { runtime: "dotnet6" },
      type: RuntimeType.DOTNET,
      runtime: "dotnet6",
    } as FunctionInfo;
    const layers: LayerJSON = {
      regions: {
        "us-east-1": {
          dotnet: "arn:aws:lambda:us-east-1:464622532012:layer:dd-trace-dotnet:9",
          "dotnet-arm": "arn:aws:lambda:us-east-1:464622532012:layer:dd-trace-dotnet-ARM:9",
          extension: "arn:aws:lambda:us-east-1:464622532012:layer:Datadog-Extension:47",
          "extension-arm": "arn:aws:lambda:us-east-1:464622532012:layer:Datadog-Extension-ARM:47",
        },
      },
    };
    const mockService = createMockService(
      "us-east-1",
      {
        "dotnet-function": { handler: "AwsDotnetCsharp::AwsDotnetCsharp.Handler::HelloWorld", runtime: "dotnet6" },
      },
      "arm64",
    );
    applyLambdaLibraryLayers(mockService, [handler], layers, undefined, false);
    expect(handler.handler).toEqual({
      runtime: "dotnet6",
    });
  });
});

describe("pushLayerARN", () => {
  it("appends a layer", () => {
    const layerARN = "extension:5";
    let currentLayers = ["node:2"];
    currentLayers = pushLayerARN(layerARN, currentLayers);
    expect(currentLayers).toEqual(["node:2", "extension:5"]);
  });

  it("does not re-append an existing layer", () => {
    const layerARN = "extension:5";
    let currentLayers = ["extension:5"];
    currentLayers = pushLayerARN(layerARN, currentLayers);
    expect(currentLayers).toEqual(["extension:5"]);
  });
});
