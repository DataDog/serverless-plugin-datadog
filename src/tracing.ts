/*
 * Unless explicitly stated otherwise all files in this repository are licensed
 * under the Apache License Version 2.0.
 *
 * This product includes software developed at Datadog (https://www.datadoghq.com/).
 * Copyright 2019 Datadog, Inc.
 */

import Service from "serverless/classes/Service";

export function enabledTracing(service: Service) {
  const provider = service.provider as any;
  provider.tracing = {
    apiGateway: true,
    lambda: true,
  };
}
