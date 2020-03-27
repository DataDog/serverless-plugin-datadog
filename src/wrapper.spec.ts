/*
 * Unless explicitly stated otherwise all files in this repository are licensed
 * under the Apache License Version 2.0.
 *
 * This product includes software developed at Datadog (https://www.datadoghq.com/).
 * Copyright 2019 Datadog, Inc.
 */

import { datadogDirectory, getWrapperText, writeHandlers, writeWrapperFunction } from "./wrapper";

import { RuntimeType } from "./layer";
import fs from "fs";
import mock from "mock-fs";

describe("getWrapperText", () => {
  it("renders the python template correctly", () => {
    const wrapperText = getWrapperText(RuntimeType.PYTHON, "mydir/func", ["myhandler"]);

    expect(wrapperText).toMatchInlineSnapshot(`
                  "from datadog_lambda.wrapper import datadog_lambda_wrapper
                  from mydir.func import myhandler as myhandler_impl
                  myhandler = datadog_lambda_wrapper(myhandler_impl)"
            `);
  });
  it("renders multiple methods with the python template correctly", () => {
    const wrapperText = getWrapperText(RuntimeType.PYTHON, "mydir/func", ["myhandler", "secondhandler"]);

    expect(wrapperText).toMatchInlineSnapshot(`
                  "from datadog_lambda.wrapper import datadog_lambda_wrapper
                  from mydir.func import myhandler as myhandler_impl
                  myhandler = datadog_lambda_wrapper(myhandler_impl)
                  from mydir.func import secondhandler as secondhandler_impl
                  secondhandler = datadog_lambda_wrapper(secondhandler_impl)"
            `);
  });
  it("renders the node template correctly", () => {
    const wrapperText = getWrapperText(RuntimeType.NODE, "my", ["myhandler"]);

    expect(wrapperText).toMatchInlineSnapshot(`
                  "const { datadog } = require(\\"datadog-lambda-js\\");
                  const original = require(\\"../my\\");
                  module.exports.myhandler = datadog(original.myhandler);"
            `);
  });
  it("renders multiple handlers with the node template", () => {
    const wrapperText = getWrapperText(RuntimeType.NODE, "my", ["myhandler", "secondhandler"]);

    expect(wrapperText).toMatchInlineSnapshot(`
                  "const { datadog } = require(\\"datadog-lambda-js\\");
                  const original = require(\\"../my\\");
                  module.exports.myhandler = datadog(original.myhandler);
                  module.exports.secondhandler = datadog(original.secondhandler);"
            `);
  });
  it("renders the node ts template correctly", () => {
    const wrapperText = getWrapperText(RuntimeType.NODE_TS, "my", ["myhandler"]);
    expect(wrapperText).toMatchInlineSnapshot(`
            "/* tslint:disable */
            /* eslint-disable */
            const { datadog } = require(\\"datadog-lambda-js\\") as any;
            import * as original from \\"../my\\";
            export const myhandler = datadog(original.myhandler);"
        `);
  });
  it("renders multiple methods with the node ts template", () => {
    const wrapperText = getWrapperText(RuntimeType.NODE_TS, "my", ["myhandler", "secondhandler"]);
    expect(wrapperText).toMatchInlineSnapshot(`
            "/* tslint:disable */
            /* eslint-disable */
            const { datadog } = require(\\"datadog-lambda-js\\") as any;
            import * as original from \\"../my\\";
            export const myhandler = datadog(original.myhandler);
            export const secondhandler = datadog(original.secondhandler);"
        `);
  });
  it("renders the node es template correctly", () => {
    const wrapperText = getWrapperText(RuntimeType.NODE_ES6, "my", ["myhandler"]);

    expect(wrapperText).toMatchInlineSnapshot(`
      "/* eslint-disable */
        const { datadog } = require(\\"datadog-lambda-js\\");
        import * as original from \\"../my\\";
        export const myhandler = datadog(original.myhandler);"
    `);
  });
  it("renders the multiple methods with the  node es template", () => {
    const wrapperText = getWrapperText(RuntimeType.NODE_ES6, "my", ["myhandler", "secondhandler"]);

    expect(wrapperText).toMatchInlineSnapshot(`
      "/* eslint-disable */
        const { datadog } = require(\\"datadog-lambda-js\\");
        import * as original from \\"../my\\";
        export const myhandler = datadog(original.myhandler);
        export const secondhandler = datadog(original.secondhandler);"
    `);
  });
});

describe("writeWrapperFunction", () => {
  beforeAll(() => {
    console.log(""); // Workaround for this issue: https://github.com/facebook/jest/issues/5792
    mock({
      [datadogDirectory]: {},
    });
  });

  afterAll(() => {
    mock.restore();
  });
  it("writes out node files to a .js file", async () => {
    await writeWrapperFunction(
      {
        filename: "mydir/my",
        funcs: [
          {
            info: {
              name: "my-lambda",
              type: RuntimeType.NODE,
              handler: {
                name: "my-lambda",
                package: {} as any,
                handler: "mydir/func.myhandler",
              },
            },
            method: "myhandler",
          },
        ],
        runtime: RuntimeType.NODE,
      },
      "my-text",
    );
    expect(fs.existsSync(`${datadogDirectory}/my-lambda.js`)).toBeTruthy();
  });
  it("writes out python files to a .py file", async () => {
    await writeWrapperFunction(
      {
        filename: "mydir/my",
        funcs: [
          {
            info: {
              name: "my-lambda",
              type: RuntimeType.PYTHON,
              handler: {
                name: "my-lambda",
                package: {} as any,
                handler: "mydir/func.myhandler",
              },
            },
            method: "myhandler",
          },
        ],
        runtime: RuntimeType.PYTHON,
      },
      "my-text",
    );
    expect(fs.existsSync(`${datadogDirectory}/my-lambda.py`)).toBeTruthy();
  });

  it("writes out one python file for each source with handlers", async () => {
    await writeWrapperFunction(
      {
        filename: "mydir/my",
        funcs: [
          {
            info: {
              name: "my-lambda",
              type: RuntimeType.PYTHON,
              handler: {
                name: "my-lambda",
                package: {} as any,
                handler: "mydir/func.myhandler",
              },
            },
            method: "myhandler",
          },
          {
            info: {
              name: "another-lambda",
              type: RuntimeType.PYTHON,
              handler: {
                name: "another-lambda",
                package: {} as any,
                handler: "mydir/func.another",
              },
            },
            method: "another",
          },
        ],
        runtime: RuntimeType.PYTHON,
      },
      "my-text",
    );
    expect(fs.existsSync(`${datadogDirectory}/my-lambda.py`)).toBeTruthy();
  });
});

describe("writeHandlers", () => {
  afterAll(() => {
    mock.restore();
  });

  it("adds created files to the includes list", async () => {
    mock({});
    const service = {} as any;
    await writeHandlers(service, [
      {
        name: "my-lambda",
        type: RuntimeType.PYTHON,
        handler: {
          name: "my-lambda",
          package: {} as any,
          handler: "mydir/func.myhandler",
        },
      },
    ]);
    expect(service).toEqual({
      package: {
        include: [`${datadogDirectory}/my-lambda.py`, `${datadogDirectory}/**`],
      },
    });
  });

  it("adds datadog_handlers to include list by default", async () => {
    mock({});
    const service = {
      package: {
        include: [],
      },
    } as any;
    await writeHandlers(service, []);
    expect(service).toEqual({
      package: {
        include: [`${datadogDirectory}/**`],
      },
    });
  });

  it("cleans up existing datadogDirectory", async () => {
    mock({
      [datadogDirectory]: {
        "unused-file": "some-value",
      },
    });
    const service = {} as any;
    await writeHandlers(service, []);
    expect(fs.existsSync(`${datadogDirectory}/unused-file`)).toBeFalsy();
  });

  it("ignores handlers with poorly formatted names", async () => {
    mock({});
    const service = {} as any;
    await writeHandlers(service, [
      {
        name: "my-lambda",
        type: RuntimeType.PYTHON,
        handler: {
          name: "my-lambda",

          package: {} as any,
          handler: "mydir-myhandler",
        },
      },
    ]);
    expect(fs.existsSync(`${datadogDirectory}/my-lambda.py`)).toBeFalsy();
  });

  it("creates well formatted handlers", async () => {
    mock({});
    const service = {} as any;
    await writeHandlers(service, [
      {
        name: "my-lambda",
        type: RuntimeType.PYTHON,
        handler: {
          name: "my-lambda",

          package: {} as any,
          handler: "mydir.myhandler",
        },
      },
    ]);
    expect(fs.existsSync(`${datadogDirectory}/my-lambda.py`)).toBeTruthy();
  });

  it("creates one file for each source handler file", async () => {
    mock({});
    const service = {} as any;
    await writeHandlers(service, [
      {
        name: "my-lambda",
        type: RuntimeType.PYTHON,
        handler: {
          name: "my-lambda",
          package: {} as any,
          handler: "mydir/func.myhandler",
        },
      },
      {
        name: "second-lambda",
        type: RuntimeType.PYTHON,
        handler: {
          name: "second-lambda",
          package: {} as any,
          handler: "mydir/func.secondhandler",
        },
      },
    ]);
    expect(service).toEqual({
      package: {
        include: [`${datadogDirectory}/my-lambda.py`, `${datadogDirectory}/**`],
      },
    });
  });
});
