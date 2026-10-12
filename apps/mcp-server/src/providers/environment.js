import { z } from "zod";
import { AppError } from "../errors.js";
import { httpJson } from "./httpJson.js";

const coordinate = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  })
  .strict();
export const weatherInputSchema = coordinate
  .extend({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    time: z
      .string()
      .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
      .default("07:00"),
  })
  .strict();
export const routeInputSchema = z
  .object({
    origin: coordinate,
    destination: coordinate,
    arriveAt: z.string().datetime({ offset: true }).optional(),
    travelMode: z.enum(["car", "pedestrian", "bicycle"]).default("car"),
  })
  .strict();
export const placeInputSchema = z
  .object({ query: z.string().min(3).max(200) })
  .strict();

export class EnvironmentProvider {
  constructor({
    fetchImpl = fetch,
    trafficApiKey,
    cacheTtlMs = 300000,
    now = () => Date.now(),
  } = {}) {
    this.fetch = fetchImpl;
    this.trafficApiKey = trafficApiKey;
    this.cacheTtlMs = cacheTtlMs;
    this.now = now;
    this.cache = new Map();
  }
  async cached(key, operation) {
    const hit = this.cache.get(key);
    if (hit && this.now() - hit.at < this.cacheTtlMs)
      return { ...structuredClone(hit.value), cached: true };
    const value = await operation();
    if (this.cache.size >= 200)
      this.cache.delete(this.cache.keys().next().value);
    this.cache.set(key, { at: this.now(), value });
    return { ...structuredClone(value), cached: false };
  }
  async weather(input) {
    const parsed = weatherInputSchema.safeParse(input);
    if (!parsed.success)
      throw new AppError(
        "INVALID_LOCATION",
        "Supply valid coordinates, an optional YYYY-MM-DD date, and HH:MM time.",
        { status: 400 },
      );
    const { latitude, longitude, date, time } = parsed.data;
    return this.cached(`weather:${JSON.stringify(parsed.data)}`, async () => {
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.search = new URLSearchParams({
        latitude,
        longitude,
        hourly: "temperature_2m,precipitation,weather_code",
        timezone: "auto",
        forecast_days: "7",
      });
      const data = await httpJson(this.fetch, url, { provider: "Open-Meteo" });
      const targetDate = date ?? data.hourly?.time?.[0]?.slice(0, 10);
      const slot = `${targetDate}T${time.slice(0, 2)}:00`;
      const index = data.hourly?.time?.indexOf(slot) ?? -1;
      const precipitation = data.hourly?.precipitation?.[index];
      const temperatureC = data.hourly?.temperature_2m?.[index];
      const weatherCode = data.hourly?.weather_code?.[index];
      if (
        index < 0 ||
        ![precipitation, temperatureC, weatherCode].every(Number.isFinite) ||
        precipitation < 0
      )
        throw new AppError(
          "WEATHER_DATA_MISSING",
          "No usable forecast exists for that local date/hour. Choose a date within the seven-day forecast.",
          { status: 503 },
        );
      return {
        provider: "Open-Meteo",
        source: "live-forecast",
        attribution: "Weather data by Open-Meteo.com (CC BY 4.0)",
        sourceUrl: "https://open-meteo.com/",
        retrievedAt: new Date(this.now()).toISOString(),
        validFor: slot,
        timezone: data.timezone,
        latitude,
        longitude,
        raining: precipitation > 0,
        precipitationMm: precipitation,
        temperatureC,
        weatherCode,
      };
    });
  }
  async traffic(input) {
    const parsed = routeInputSchema.safeParse(input);
    if (!parsed.success)
      throw new AppError(
        "INVALID_ROUTE",
        "Supply valid origin and destination coordinates.",
        { status: 400 },
      );
    if (!this.trafficApiKey)
      throw new AppError(
        "TRAFFIC_NOT_CONFIGURED",
        "Optional traffic requires TOMTOM_API_KEY. Weather works without it.",
        { status: 503 },
      );
    return this.cached(`traffic:${JSON.stringify(parsed.data)}`, async () => {
      const { origin, destination, arriveAt, travelMode } = parsed.data;
      const points = `${origin.latitude},${origin.longitude}:${destination.latitude},${destination.longitude}`;
      const url = new URL(
        `https://api.tomtom.com/routing/1/calculateRoute/${points}/json`,
      );
      url.search = new URLSearchParams({
        key: this.trafficApiKey,
        traffic: "true",
        ...(arriveAt ? { arriveAt } : { departAt: "now" }),
        travelMode,
        routeRepresentation: "summaryOnly",
        computeTravelTimeFor: "all",
        routeType: "fastest",
      });
      const data = await httpJson(this.fetch, url, {
        provider: "TomTom",
        maxBytes: 1048576,
      });
      const summary = data.routes?.[0]?.summary;
      if (
        !summary ||
        ![
          summary.travelTimeInSeconds,
          summary.trafficDelayInSeconds,
          summary.lengthInMeters,
        ].every(Number.isFinite) ||
        summary.trafficDelayInSeconds < 0 ||
        summary.travelTimeInSeconds <= 0
      )
        throw new AppError(
          "TRAFFIC_DATA_MISSING",
          "TomTom returned no usable route timing.",
          { status: 503 },
        );
      const delayMinutes = Math.ceil(summary.trafficDelayInSeconds / 60);
      if (delayMinutes > 60)
        throw new AppError(
          "TRAFFIC_OUT_OF_RANGE",
          "The reported delay exceeds the supported 60-minute adaptation range. Review the goal manually.",
          { status: 409 },
        );
      return {
        provider: "TomTom",
        source: arriveAt ? "arrival-time-route-estimate" : "live-route-now",
        sourceUrl: "https://www.tomtom.com/",
        attribution: "Routing and traffic data © TomTom",
        retrievedAt: new Date(this.now()).toISOString(),
        departureTime: summary.departureTime,
        arrivalTime: summary.arrivalTime,
        requestedArrival: arriveAt,
        travelMode,
        travelMinutes: Math.ceil(summary.travelTimeInSeconds / 60),
        delayMinutes,
        distanceMeters: summary.lengthInMeters,
        origin,
        destination,
        note: "Travel time already includes provider traffic. Future timing uses predictive/historical conditions, not knowledge of future incidents. Estimates are not guarantees.",
      };
    });
  }
  async places(input) {
    const { query } = placeInputSchema.parse(input);
    if (!this.trafficApiKey)
      throw new AppError(
        "TRAFFIC_NOT_CONFIGURED",
        "Address lookup requires TOMTOM_API_KEY.",
        { status: 503 },
      );
    return this.cached(`place:${query}`, async () => {
      const url = new URL(
        `https://api.tomtom.com/search/2/geocode/${encodeURIComponent(query)}.json`,
      );
      url.search = new URLSearchParams({ key: this.trafficApiKey, limit: "5" });
      const data = await httpJson(this.fetch, url, { provider: "TomTom" });
      const places = (data.results ?? [])
        .filter(
          (item) =>
            coordinate.safeParse({
              latitude: item.position?.lat,
              longitude: item.position?.lon,
            }).success,
        )
        .map((item) => ({
          label: item.address?.freeformAddress ?? query,
          latitude: item.position.lat,
          longitude: item.position.lon,
        }));
      return {
        provider: "TomTom",
        attribution: "Search data © TomTom",
        places,
        message:
          "Select the intended address. Results are suggestions, not a verified home or office.",
      };
    });
  }
  async context(
    profile,
    { dataMode = "live", date, time, includeTraffic = false } = {},
  ) {
    if (!["live", "fixture", "none"].includes(dataMode))
      throw new AppError(
        "INVALID_DATA_MODE",
        "Choose live, fixture, or none.",
        { status: 400 },
      );
    if (dataMode !== "live")
      return {
        ...structuredClone(profile.environment),
        dataMode,
        evidence: [],
        ...(dataMode === "none"
          ? { weather: { raining: false }, travelDelayMinutes: 0 }
          : {}),
        ...(date
          ? {
              planningDate: date,
              weekday: new Intl.DateTimeFormat("en-US", {
                weekday: "long",
                timeZone: "UTC",
              }).format(new Date(`${date}T12:00:00Z`)),
            }
          : {}),
      };
    if (!profile.location)
      throw new AppError(
        "LOCATION_REQUIRED",
        "Configure household coordinates before using live weather.",
        { status: 400 },
      );
    const weather = await this.weather({
      ...profile.location,
      ...(date ? { date } : {}),
      ...(time ? { time } : {}),
    });
    const evidence = [weather];
    let travelDelayMinutes = 0;
    if (includeTraffic) {
      if (!profile.route)
        throw new AppError(
          "ROUTE_REQUIRED",
          "Configure origin and destination coordinates before enabling traffic.",
          { status: 400 },
        );
      const traffic = await this.traffic(profile.route);
      evidence.push(traffic);
      travelDelayMinutes = traffic.delayMinutes;
    }
    const weekday = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      timeZone: "UTC",
    }).format(new Date(`${weather.validFor.slice(0, 10)}T12:00:00Z`));
    return {
      ...structuredClone(profile.environment),
      weekday,
      weather: { raining: weather.raining },
      travelDelayMinutes,
      dataMode,
      evidence,
      planningDate: weather.validFor.slice(0, 10),
      planningTime: time ?? "07:00",
      includeTraffic,
    };
  }
}
