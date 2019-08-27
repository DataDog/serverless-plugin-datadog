/*
 * Unless explicitly stated otherwise all files in this repository are licensed
 * under the Apache License Version 2.0.
 * 
 * This product includes software developed at Datadog (https://www.datadoghq.com/).
 * Copyright 2019 Datadog, Inc.
 */

import * as fs from "fs";

import { promisify } from "util";

const exists = promisify(fs.exists);
const readdir = promisify(fs.readdir);
const lstat = promisify(fs.lstat);
const unlink = promisify(fs.unlink);
const rmdir = promisify(fs.rmdir);

export async function removeDirectory(path: string) {
  const dirExists = await exists(path);
  if (dirExists) {
    const files = await readdir(path);
    for (const file of files) {
      const curPath = path + "/" + file;
      const stats = await lstat(curPath);
      if (stats.isDirectory()) {
        await removeDirectory(curPath);
      } else {
        await unlink(curPath);
      }
    }
    await rmdir(path);
  }
}
