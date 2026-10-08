import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getGitCommitInfo } from "@datadog/datadog-ci-base/commands/git-metadata/library";
import { newSimpleGit } from "./git";

describe("Git integration", () => {
  let temporaryDirectory: string;
  let repositoryDirectory: string;
  let nestedDirectory: string;
  let commitHash: string;

  beforeEach(() => {
    temporaryDirectory = realpathSync(mkdtempSync(join(tmpdir(), "datadog-git-")));
    repositoryDirectory = join(temporaryDirectory, "repository");
    nestedDirectory = join(repositoryDirectory, "nested");
    mkdirSync(nestedDirectory, { recursive: true });

    // Datadog may add safe.directory in CI. simple-git filters GIT_CONFIG_GLOBAL,
    // so isolate the home directories as well to contain global Git config writes.
    vi.stubEnv("HOME", temporaryDirectory);
    vi.stubEnv("XDG_CONFIG_HOME", join(temporaryDirectory, "config"));
    vi.stubEnv("GIT_CONFIG_GLOBAL", join(temporaryDirectory, "gitconfig"));
    vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");

    const git = (...args: string[]) => execFileSync("git", args, { cwd: repositoryDirectory, encoding: "utf8" });
    git("init", "--quiet", "--initial-branch=main");
    git("config", "user.name", "Git Integration Test");
    git("config", "user.email", "git-test@example.com");
    writeFileSync(join(repositoryDirectory, "root.ts"), "export const root = true;\n");
    writeFileSync(join(nestedDirectory, "nested.ts"), "export const nested = true;\n");
    git("add", ".");
    git("commit", "--quiet", "--no-gpg-sign", "-m", "Initial test commit");
    git("remote", "add", "origin", "https://github.com/example/security-upgrade.git");
    commitHash = git("rev-parse", "HEAD").trim();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  it("detects a Git repository and reads its current commit", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(repositoryDirectory);

    const git = await newSimpleGit();

    expect(git).toBeDefined();
    expect(await git!.checkIsRepo()).toBe(true);
    expect(await git!.revparse("HEAD")).toBe(commitHash);
  });

  it("uses the repository root when called from a nested directory", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(nestedDirectory);

    const git = await newSimpleGit();

    expect(git).toBeDefined();
    expect(await git!.raw("ls-files")).toBe("nested/nested.ts\nroot.ts\n");
  });

  it("returns undefined outside a Git repository", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(temporaryDirectory);

    expect(await newSimpleGit()).toBeUndefined();
  });

  it("reads Datadog commit metadata from a nested directory", async () => {
    vi.spyOn(process, "cwd").mockReturnValue(nestedDirectory);

    expect(await getGitCommitInfo()).toEqual(["github.com/example/security-upgrade.git", commitHash]);
  });
});
