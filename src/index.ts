import * as Serverless from "serverless";

export default class ServerlessPlugin {
  public hooks = {
    "before:deploy:function:packageFunction": this.beforeDeployFunction.bind(this),
  };

  constructor(private serverless: Serverless, private options: Serverless.Options) {}

  private beforeDeployFunction() {
    this.serverless.cli.log("Called before function deploy!");
  }
}
