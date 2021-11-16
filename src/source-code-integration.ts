import { SimpleGit } from "simple-git";
import { version } from "../package.json";
import { getCommitInfo } from "./git";
import { getBaseIntakeUrl } from "./git-metadata/api";
import { CommitInfo } from "./git-metadata/interfaces";
import { newApiKeyValidator } from "./helpers/apikey";
import { InvalidConfigurationError } from "./helpers/errors";
import { RequestBuilder } from "./helpers/interfaces";
import { upload, UploadOptions, UploadStatus } from "./helpers/upload";
import { getRequestBuilder } from "./helpers/utils";

export class SourceCodeIntegration {
  public repositoryURL?: string;
  private apiKey: string;
  private datadogSite: string;
  private simpleGit: SimpleGit;

  constructor(apiKey: string, datadogSite: string, simpleGit: SimpleGit, repositoryURL?: string) {
    this.apiKey = apiKey;
    this.datadogSite = datadogSite;
    this.simpleGit = simpleGit;
    this.repositoryURL = repositoryURL;
  }

  public async uploadGitMetadata() {
    const apiKeyValidator = newApiKeyValidator({
      apiKey: this.apiKey,
      datadogSite: this.datadogSite,
    });
    const payload = await getCommitInfo(this.simpleGit, this.repositoryURL);
    if (payload === undefined) {
      throw Error("Couldn't get git commit information.");
    }
    try {
      const requestBuilder = this.getRequestBuilder();
      const status = await this.uploadRepository(requestBuilder)(payload, {
        apiKeyValidator,
        onError: (e: Error) => {
          throw e;
        },
        onRetry: (_) => {},
        onUpload: () => {
          return;
        },
        retries: 5,
      });

      if (status !== UploadStatus.Success) {
        throw new Error("Error uploading commit information.");
      }

      return payload.hash;
    } catch (error) {
      throw error;
    }
  }

  private getRequestBuilder(): RequestBuilder {
    if (!this.apiKey) {
      throw new InvalidConfigurationError("Missing DATADOG_API_KEY in your environment.");
    }

    return getRequestBuilder({
      apiKey: this.apiKey!,
      baseUrl: getBaseIntakeUrl(),
    });
  }

  private uploadRepository(
    requestBuilder: RequestBuilder,
  ): (commitInfo: CommitInfo, opts: UploadOptions) => Promise<UploadStatus> {
    return async (commitInfo: CommitInfo, opts: UploadOptions) => {
      const payload = commitInfo.asMultipartPayload(`serverless-plugin-datadog-${version}`);

      return upload(requestBuilder)(payload, opts);
    };
  }
}
