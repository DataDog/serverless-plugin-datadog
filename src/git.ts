import * as simpleGit from "simple-git";

// Returns a configured SimpleGit.
export const newSimpleGit = async (): Promise<simpleGit.SimpleGit | undefined> => {
  const options = {
    baseDir: process.cwd(),
    binary: "git",
    maxConcurrentProcesses: 1,
  };
  try {
    // Attempt to set the baseDir to the root of the repository so the 'git ls-files' command
    // returns the tracked files paths relative to the root of the repository.
    const git = simpleGit.gitP(options);
    const root = await git.revparse("--show-toplevel");
    options.baseDir = root;
  } catch {
    return undefined;
  }

  return simpleGit.gitP(options);
};
