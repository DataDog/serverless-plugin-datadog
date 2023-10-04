# Contributing

We love pull requests. Here's a quick guide.

1. Fork, clone and branch off:
    ```bash
    git clone git@github.com:<your-username>/serverless-plugin-datadog.git
    git checkout -b <my-branch>
    yarn install
    ```
1. Make your changes.
1. Test your changes against your own testing application with the help of [`yarn link`](https://classic.yarnpkg.com/en/docs/cli/link/):
    ```bash
    # From the root of the serverless-plugin-datadog repo
    yarn build
    cd dist
    yarn link

    # From the root of your own serverless application
    yarn link "serverless-plugin-datadog"
    sls deploy
    ```
1. Ensure the unit tests pass:
    ```bash
    yarn test
    ```
1. Push to your fork and [submit a pull request][pr].

[pr]: https://github.com/your-username/datadog-lambda-layer-python/compare/DataDog:master...master

At this point you're waiting on us. We may suggest some changes or improvements or alternatives.
