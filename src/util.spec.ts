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
