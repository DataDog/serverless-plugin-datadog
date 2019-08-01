import { findHandlers, LayerJSON, RuntimeType, applyLayers, HandlerInfo } from "./layer";
import Service from "serverless/classes/Service";
import { FunctionDefinition } from "serverless";

function createMockService(region: string, funcs: { [funcName: string]: Partial<FunctionDefinition> }): Service {
  const service: Partial<Service> = {
    provider: { region } as any,
    getAllFunctionsNames: () => Object.keys(funcs),
    getFunction: (name) => funcs[name] as FunctionDefinition,
  };
  return service as Service;
}

describe("findHandlers", () => {
  it("finds all node and python layers with matching layers", () => {
    const mockService = createMockService("us-east-1", {
      "func-a": { runtime: "nodejs8.10" },
      "func-b": { runtime: "go1.10" },
      "func-c": { runtime: "nodejs10.x" },
      "func-d": { runtime: "python2.7" },
      "func-e": { runtime: "python3.6" },
      "func-f": { runtime: "python3.7" },
    });

    const result = findHandlers(mockService);
    expect(result).toMatchObject([
      {
        handler: { runtime: "nodejs8.10" },
        type: RuntimeType.NODE,
      },
      {
        handler: { runtime: "nodejs10.x" },
        type: RuntimeType.NODE,
      },
      {
        handler: { runtime: "python2.7" },
        type: RuntimeType.PYTHON,
      },
      {
        handler: { runtime: "python3.6" },
        type: RuntimeType.PYTHON,
      },
      {
        handler: { runtime: "python3.7" },
        type: RuntimeType.PYTHON,
      },
    ]);
  });
});

describe("applyLayers", () => {
  it("adds a layer array if none are present", () => {
    const handler = {
      handler: { runtime: "nodejs10.x" },
      type: RuntimeType.NODE,
    } as HandlerInfo;
    const layers: LayerJSON = {
      regions: { "us-east-1": { "nodejs10.x": "node:2" } },
    };
    applyLayers("us-east-1", [handler], layers);
    expect(handler.handler).toEqual({
      runtime: "nodejs10.x",
      layers: ["node:2"],
    });
  });
  it("appends to the layer array if already present", () => {
    const handler = {
      handler: { runtime: "nodejs10.x", layers: ["node:1"] } as any,
      type: RuntimeType.NODE,
    } as HandlerInfo;
    const layers: LayerJSON = {
      regions: { "us-east-1": { "nodejs10.x": "node:2" } },
    };
    applyLayers("us-east-1", [handler], layers);
    expect(handler.handler).toEqual({
      runtime: "nodejs10.x",
      layers: ["node:1", "node:2"],
    });
  });
  it("doesn't add duplicate layers", () => {
    const handler = {
      handler: { runtime: "nodejs10.x", layers: ["node:1"] } as any,
      type: RuntimeType.NODE,
    } as HandlerInfo;
    const layers: LayerJSON = {
      regions: { "us-east-1": { "nodejs10.x": "node:1" } },
    };
    applyLayers("us-east-1", [handler], layers);
    expect(handler.handler).toEqual({
      runtime: "nodejs10.x",
      layers: ["node:1"],
    });
  });
  it("only adds layer when region can be found", () => {
    const handler = {
      handler: { runtime: "nodejs10.x" } as any,
      type: RuntimeType.NODE,
    } as HandlerInfo;
    const layers: LayerJSON = {
      regions: { "us-east-1": { "nodejs10.x": "node:1" } },
    };
    applyLayers("us-east-2", [handler], layers);
    expect(handler.handler).toEqual({
      runtime: "nodejs10.x",
    });
  });
  it("only adds layer when layer ARN can be found", () => {
    const handler = {
      handler: { runtime: "nodejs10.x", layers: ["node:1"] } as any,
      type: RuntimeType.NODE,
    } as HandlerInfo;
    const layers: LayerJSON = {
      regions: { "us-east-1": { "python2.7": "python:2" } },
    };
    applyLayers("us-east-1", [handler], layers);
    expect(handler.handler).toMatchObject({
      runtime: "nodejs10.x",
    });
  });
});
