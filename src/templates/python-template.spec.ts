import { pythonTemplate } from "./python-template";

describe("pythonTemplate", () => {
  it("handles nested directories", () => {
    const result = pythonTemplate("my/file/path", ["method"]);
    expect(result).toMatchInlineSnapshot(`
                  "from datadog_lambda.wrapper import datadog_lambda_wrapper
                  from my.file.path import method as method_impl
                  method = datadog_lambda_wrapper(method_impl)"
            `);
  });
  it("handles windows directories", () => {
    const result = pythonTemplate(`my\\file\\path`, ["method"]);
    expect(result).toMatchInlineSnapshot(`
      "from datadog_lambda.wrapper import datadog_lambda_wrapper
      from my.file.path import method as method_impl
      method = datadog_lambda_wrapper(method_impl)"
    `);
  });
});
