/*
 * Unless explicitly stated otherwise all files in this repository are licensed
 * under the Apache License Version 2.0.
 *
 * This product includes software developed at Datadog (https://www.datadoghq.com/).
 * Copyright 2019 Datadog, Inc.
 */

import * as fs from "fs";

import mock from "mock-fs";
import { removeDirectory } from "./util";

describe("removeDirectory", () => {
  beforeAll(() => {
    mock({
      testdir: {
        "some-file.txt": "file content here",
        subDir: {
          "another.txt": "another file",
          emptyDir: {},
        },
      },
    });
  });
  afterAll(() => {
    mock.restore();
  });

  it("removes a directory and it's children", async () => {
    await removeDirectory("testDir");
    expect(fs.existsSync("testDir")).toBeFalsy();
  });
});
