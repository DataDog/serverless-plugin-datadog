import * as Serverless from "serverless";

import * as layers from "./layers.json";

export default class ServerlessPlugin {
  public hooks = {
    "before:deploy:function:packageFunction": this.beforeDeployFunction.bind(this),
  };

  constructor(private serverless: Serverless, private options: Serverless.Options) {}

  private beforeDeployFunction() {
    console.log(`Adding the following layers${layers}`);
    this.serverless.cli.log("Called before function deploy!");
  }
}
