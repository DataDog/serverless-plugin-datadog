import { getWrapperText } from "./wrapper";
import { RuntimeType } from "./layer";

describe("getWrapperText", () => {
  it("renders the python template correctly", () => {
    const wrapperText = getWrapperText({
      name: "my-lambda",
      type: RuntimeType.PYTHON,
      handler: {
        name: "",
        package: {} as any,
        handler: "mydir/func.myhandler",
      },
    });
    expect(wrapperText).toMatchInlineSnapshot(`
            "from datadog_lambda.wrapper import datadog_lambda_wrapper
            from mydir.func import myhandler as myhandler_impl
            myhandler = datadog_lambda_wrapper(myhandler_impl)"
        `);
  });
  it("renders the node template correctly", () => {
    const wrapperText = getWrapperText({
      name: "my-lambda",
      type: RuntimeType.NODE,
      handler: {
        name: "",
        package: {} as any,
        handler: "my.myhandler",
      },
    });
    expect(wrapperText).toMatchInlineSnapshot(`
      "const { datadog } = require(\\"datadog-lambda-js\\");
      const original = require(\\"my\\");
      module.exports.myhandler = datadog(original.myhandler);"
    `);
  });
});
