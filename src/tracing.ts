import Service from "serverless/classes/Service";

export function enabledTracing(service: Service) {
  const provider = service.provider as any;
  provider.tracing = {
    apiGateway: true,
    lambda: true,
  };
}
