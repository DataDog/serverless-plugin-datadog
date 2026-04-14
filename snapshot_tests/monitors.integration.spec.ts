import { getRecommendedMonitors } from "../src/monitor-api-requests";

describe("Integration Test for setMonitors", () => {
  const expectedMonitors = [
    "high_cold_start_rate",
    "timeout",
    "out_of_memory",
    "high_iterator_age",
    "high_cold_start_rate",
    "high_throttles",
    "increased_cost",
  ];

  it("retrieves recommended monitors from Datadog Monitor API", async () => {
    const apiKey = process.env.DD_API_KEY;
    const appKey = process.env.DD_APP_KEY;
    if (!apiKey || !appKey) {
      throw new Error(
        "DD_API_KEY and DD_APP_KEY must be set. Please run this test using `DD_API_KEY=<DD_API_KEY> DD_APP_KEY=<DD_APP_KEY> npm run test:integration`",
      );
    }

    const recommendedMonitors = await getRecommendedMonitors("datadoghq.com", apiKey, appKey);

    for (const expectedMonitor of expectedMonitors) {
      expect(recommendedMonitors).toHaveProperty(expectedMonitor);
    }
  });
});
