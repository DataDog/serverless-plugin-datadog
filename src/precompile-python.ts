import { spawnSync, execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

export function precompilePython(serverless: any) {
  serverless.cli.log('Precompiling Python files');
  let tempDirName = 'datadog';
  let slsDir = serverless.processedInput.options.package || '.serverless';
  let tempDir = path.resolve(slsDir, tempDirName);

  for (const file of lsDirFiles(slsDir, false)) {
    if (file.endsWith('.zip')) {
      preCompilePackage(serverless.service.provider.runtime, tempDir, file);
    }
  }
}

function preCompilePackage(python: string, tempDir: string, zipFile: string) {
  spawnSync('unzip', ['-d', tempDir, zipFile]);
  precompile(python, tempDir);
  replacePyFiles(tempDir);
  spawnSync('rm', [zipFile]);
  execSync(`cd ${tempDir} && zip -r ${zipFile} .`);
  spawnSync('rm', ['-r', tempDir]);
}

function precompile(python: string, dir: string) {
  // TODO: run precompile in docker container
  //spawnSync('python', ['-m', 'compileall', '-b', dir]);
  console.log("----------------------------------------");
  console.log("python: ", python);
  console.log("----------------------------------------");
  let image = python.replace('python3', 'python:3');
  spawnSync('docker', ['run', '-v', `${dir}:/mnt`, image, 'python', '-m', 'compileall', '-b', '/mnt']);
}

function replacePyFiles(dir: string) {
  for (const file of lsDirFiles(dir)) {
    if (file.endsWith('.pyc')) {
      let pyFile = file.replace('.pyc', '.py');
      spawnSync('rm', [pyFile]);
    }
  }
}

function* lsDirFiles(dir: string, recursive = true): Generator<string> {
  for (const dirent of fs.readdirSync(dir, { withFileTypes: true })) {
    const res = path.resolve(dir, dirent.name);
    if (recursive && dirent.isDirectory()) {
      yield* lsDirFiles(res, recursive);
    } else {
      yield res;
    }
  }
}
