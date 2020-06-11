/*
 * Unless explicitly stated otherwise all files in this repository are licensed
 * under the Apache License Version 2.0.
 *
 * This product includes software developed at Datadog (https://www.datadoghq.com/).
 * Copyright 2019 Datadog, Inc.
 */

import { redirectHandlers } from "./wrapper";
import {
  datadogHandlerEnvVar,
  jsHandlerLayerPrefix,
  jsHandler,
  jsHandlerFile,
  pythonHandler,
  pythonHandlerFile,
} from "./wrapper";
import { RuntimeType } from "./layer";
import mock from "mock-fs";

describe("redirectHandlers", () => {
  afterAll(() => {
    mock.restore();
  });

  it("adds redirect handler file to the includes list", async () => {
    mock({});
    const service = {} as any;
    redirectHandlers(
      service,
      [
        {
          name: "my-lambda",
          type: RuntimeType.PYTHON,
          handler: {
            name: "my-lambda",
            package: {} as any,
            handler: "mydir/func.myhandler",
            events: [],
          },
        },
      ],
      true,
    );
    expect(service).toEqual({
      package: {
        include: [`${pythonHandlerFile}`],
      },
    });
  });

  it("redirects js handlers correctly when addLayers is true", async () => {
    mock({});
    const service = {} as any;
    redirectHandlers(
      service,
      [
        {
          name: "my-lambda",
          type: RuntimeType.NODE,
          handler: {
            name: "my-lambda",
            package: {} as any,
            handler: "mydir/func.myhandler",
            events: [],
          },
        },
      ],
      true,
    );
    expect(service).toEqual({
      package: {
        include: [`${jsHandlerLayerPrefix}${jsHandlerFile}`],
      },
    });
  });

  it("redirects js handlers correctly when addLayers is false", async () => {
    mock({});
    const service = {} as any;
    redirectHandlers(
      service,
      [
        {
          name: "my-lambda",
          type: RuntimeType.NODE,
          handler: {
            name: "my-lambda",
            package: {} as any,
            handler: "mydir/func.myhandler",
            events: [],
          },
        },
      ],
      false,
    );
    expect(service).toEqual({
      package: {
        include: [`${jsHandlerFile}`],
      },
    });
  });

  it("does not push duplicate versions of redirected handler", async () => {
    mock({});
    const service = {} as any;
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
      service,
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
    expect(service).toEqual({
      package: {
        include: [`${pythonHandlerFile}`],
      },
    });
    expect(handler1.handler).toEqual(pythonHandler);
    expect(handler2.handler).toEqual(pythonHandler);
  });

  it("redirects handler and sets env variable to original handler", async () => {
    mock({});
    const service = {} as any;
    const handler = {
      name: "my-lambda",
      package: {} as any,
      handler: "mydir/func.myhandler",
      events: [],
    };
    redirectHandlers(
      service,
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
      package: { include: [`${jsHandlerFile}`] },
      handler: jsHandler,
      events: [],
      environment: { [datadogHandlerEnvVar]: "mydir/func.myhandler" },
    });
  });
});
