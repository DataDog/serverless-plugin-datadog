/*
 * Unless explicitly stated otherwise all files in this repository are licensed
 * under the Apache License Version 2.0.
 *
 * This product includes software developed at Datadog (https://www.datadoghq.com/).
 * Copyright 2019 Datadog, Inc.
 */

import { redirectHandlers } from "./wrapper";
import { datadogHandlerEnvVar, jsHandler, jsHandlerWithLayers, pythonHandler } from "./wrapper";
import { RuntimeType } from "./layer";
import mock from "mock-fs";

describe("redirectHandlers", () => {
  afterAll(() => {
    mock.restore();
  });

  it("redirects js handlers correctly when addLayers is true", async () => {
    mock({});
    const handler = {
      name: "my-lambda",
      package: {} as any,
      handler: "mydir/func.myhandler",
      events: [],
    };
    redirectHandlers(
      [
        {
          name: "my-lambda",
          type: RuntimeType.NODE,
          handler: handler,
        },
      ],
      true,
    );
    expect(handler.handler).toEqual(jsHandlerWithLayers);
  });

  it("redirects js handlers correctly when addLayers is false", async () => {
    mock({});
    const handler = {
      name: "my-lambda",
      package: {} as any,
      handler: "mydir/func.myhandler",
      events: [],
    };
    redirectHandlers(
      [
        {
          name: "my-lambda",
          type: RuntimeType.NODE,
          handler: handler,
        },
      ],
      false,
    );
    expect(handler.handler).toEqual(jsHandler);
  });

  it("does not push duplicate versions of redirected handler", async () => {
    mock({});
    const handler1 = {
      name: "my-lambda",
      package: {} as any,
      handler: "mydir/func.myhandler",
      events: [],
    };
    const handler2 = {
      name: "second-lambda",
      package: {} as any,
      handler: "mydir/func.secondhandler",
      events: [],
    };
    redirectHandlers(
      [
        {
          name: "my-lambda",
          type: RuntimeType.PYTHON,
          handler: handler1,
        },
        {
          name: "second-lambda",
          type: RuntimeType.PYTHON,
          handler: handler2,
        },
      ],
      true,
    );
    expect(handler1.handler).toEqual(pythonHandler);
    expect(handler2.handler).toEqual(pythonHandler);
  });

  it("redirects handler and sets env variable to original handler", async () => {
    mock({});
    const handler = {
      name: "my-lambda",
      package: {} as any,
      handler: "mydir/func.myhandler",
      events: [],
    };
    redirectHandlers(
      [
        {
          name: "my-lambda",
          type: RuntimeType.NODE,
          handler: handler,
        },
      ],
      false,
    );
    expect(handler).toEqual({
      name: "my-lambda",
      package: { include: [] },
      handler: jsHandler,
      events: [],
      environment: { [datadogHandlerEnvVar]: "mydir/func.myhandler" },
    });
  });

  it("does not modify image based function definitions", async () => {
    mock({});
    const funcDef = {
      name: "my-lambda",
      package: {} as any,
      image: "my.oci.image",
      events: [],
    };
    const origFuncDef = {
      ...funcDef,
    };
    redirectHandlers(
      [
        {
          name: "my-lambda",
          type: RuntimeType.NODE,
          handler: funcDef,
        },
      ],
      true,
    );
    expect(funcDef).toEqual(origFuncDef);
  });
});
