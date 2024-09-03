const express = require("express");
const axios = require("axios");
const redis = require("redis");
const NodeCache = require("node-cache");
require("dotenv").config(); // Load environment variables from .env if present

async function createServer(options = {}) {
  const app = express();

  // Determine the caching strategy (Redis or NodeCache)
  let cacheClient;
  let useRedis = false;
  let redisClient; // Declare redisClient here so it can be accessed in cleanup

  const redisUrl = options.redisUrl || process.env.REDIS_URL;

  if (redisUrl) {
    console.log("Attempting to connect to Redis...");
    // Use Redis if redisUrl is provided
    redisClient = redis.createClient({
      url: redisUrl,
      socket: {
        connectTimeout: 5000, // Set a 5-second timeout for connecting to Redis
      },
    });

    redisClient.on("error", (err) => {
      console.error("Redis Client Error:", err);
    });

    redisClient.on("connect", () => {
      console.log("Redis client connected");
    });

    redisClient.on("ready", () => {
      console.log("Redis client ready");
    });

    redisClient.on("reconnecting", () => {
      console.log("Redis client reconnecting");
    });

    redisClient.on("end", () => {
      console.log("Redis client disconnected");
    });

    try {
      await redisClient.connect(); // Ensure Redis client is connected
      useRedis = true;
      console.log("Connected to Redis.");

      // Set up cacheClient using native async methods
      cacheClient = {
        get: async (key) => await redisClient.get(key),
        set: async (key, value) => await redisClient.set(key, value),
        del: async (key) => await redisClient.del(key),
      };

      // Test Redis connectivity
      await redisClient.ping();
      console.log("Redis ping successful.");
    } catch (err) {
      console.error("Redis connection error:", err);
      console.log("Falling back to NodeCache.");
      useRedis = false;
    }
  }

  if (!useRedis) {
    console.log("Initializing NodeCache...");
    // Use NodeCache if Redis is not available
    const nodeCache = new NodeCache({ stdTTL: 2592000 }); // Default TTL is 30 days
    cacheClient = {
      get: async (key) => nodeCache.get(key),
      set: async (key, value) => nodeCache.set(key, value),
      del: async (key) => nodeCache.del(key),
    };

    console.log("Using NodeCache for caching.");
  }

  // Define cacheable fields, using `/` for subsets of geometry
  const cacheableFields = [
    "formatted_address",
    "geometry",
    "geometry/location",
    "geometry/viewport",
    "place_id",
    "name",
    "address_components",
    "types",
  ];

  // Function to cache specific fields from the API response
  function cacheFields(data) {
    console.log("Caching data...");
    const cachedData = {
      formatted_address: data.formatted_address,
      geometry: {
        location: data.geometry?.location,
        viewport: data.geometry?.viewport,
      },
      place_id: data.place_id,
      name: data.name,
      address_components: data.address_components,
      types: data.types,
    };
    console.log("Data cached:", cachedData);
    return cachedData;
  }

  // Function to filter the cached data based on requested fields
  function filterFields(data, fields) {
    console.log("Filtering cached data...");
    const filteredData = {};

    fields.forEach((field) => {
      if (field === "geometry") {
        // If "geometry" is requested, return the whole geometry object if available
        if (data.geometry) {
          filteredData.geometry = data.geometry;
        }
      } else if (field.startsWith("geometry/")) {
        // If a subset of "geometry" is requested, return the specific part if available
        const subField = field.split("/")[1];
        if (data.geometry && data.geometry[subField] !== undefined) {
          filteredData.geometry = filteredData.geometry || {};
          filteredData.geometry[subField] = data.geometry[subField];
        }
      } else if (data[field] !== undefined) {
        // For all other fields, return the data if available
        filteredData[field] = data[field];
      }
    });

    console.log("Filtered data returned"); // Log the filtered data
    return filteredData;
  }

  // Function to fetch data from Google Maps API
  async function fetchFromGoogleMapsApi(url) {
    console.log("Fetching data from Google Maps API:", url);
    try {
      const response = await axios.get(url);
      console.log("Data fetched from Google Maps API.");
      return response.data;
    } catch (error) {
      console.error("Error fetching from Google Maps API:", error);
      throw error;
    }
  }

  function checkForMissingFields(cachedData, requestedFields) {
    return requestedFields.filter((field) => {
      if (field.startsWith("geometry/")) {
        const subField = field.split("/")[1];
        return !(
          cachedData.geometry && cachedData.geometry[subField] !== undefined
        );
      } else if (field === "geometry") {
        return cachedData.geometry === undefined;
      } else {
        return cachedData[field] === undefined;
      }
    });
  }

  // Route to handle specific caching logic for /place/details/json
  app.get("/maps/api/place/details/json", async (req, res) => {
    console.log("Received request:", req.query);

    const { place_id, fields, key } = req.query;

    if (!place_id || !key) {
      console.log("Missing place_id or key in request.");
      return res.status(400).json({ error: "place_id and key are required" });
    }

    const cacheKey = `place:${place_id}`;
    console.log("Generated cache key:", cacheKey);

    // Parse requested fields
    const requestedFields = fields ? fields.split(",") : cacheableFields;
    console.log("Requested fields:", requestedFields);

    // Check if non-cacheable fields are requested
    let useCache = true;
    let cachedData;

    try {
      // Try to get cached data from Redis or NodeCache
      const cachedDataJson = await cacheClient.get(cacheKey);
      if (cachedDataJson) {
        console.log("Cache hit");
        cachedData = useRedis ? JSON.parse(cachedDataJson) : cachedDataJson;

        // Check if all requested fields are present in the cached data
        const missingFields = checkForMissingFields(
          cachedData,
          requestedFields
        );

        if (missingFields.length > 0) {
          console.log("Cache miss due to missing fields:", missingFields);
          useCache = false;
        } else {
          console.log("All requested fields found in cache.");
        }
      } else {
        console.log("Cache miss");
        useCache = false;
      }
    } catch (error) {
      console.error("Error retrieving data from cache:", error);
      useCache = false;
    }

    if (!useCache) {
      // Build the Google Maps API URL without modifying the key
      const apiUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place_id}&fields=${requestedFields.join(
        ","
      )}&key=${key}`;
      console.log("Constructed Google Maps API URL:", apiUrl);

      try {
        // Fetch data from the Google Maps API
        const data = await fetchFromGoogleMapsApi(apiUrl);

        if (data.status === "OK") {
          console.log("Google Maps API returned OK status.");

          // Cache the specific fields
          const newCachedData = cacheFields(data.result);

          // Replace the old cache with the new data
          await cacheClient.set(
            cacheKey,
            useRedis ? JSON.stringify(newCachedData) : newCachedData
          );

          // Filter and return the requested fields
          const filteredData = filterFields(newCachedData, requestedFields);
          return res.json(filteredData);
        } else {
          console.log("Google Maps API returned error status:", data.status);
          return res.status(400).json(data);
        }
      } catch (error) {
        console.error("Error during Google Maps API request:", error);
        return res.status(500).json({ error });
      }
    } else {
      // If all requested fields are found in the cache, return the filtered data
      const filteredData = filterFields(cachedData, requestedFields);
      return res.json(filteredData);
    }
  });

  // Generic proxy route to pass through all other API requests without modification
  app.use("/maps/api", async (req, res) => {
    console.log("Proxying request to Google Maps API:", req.originalUrl);
    try {
      // Fetch and pass through the data from Google Maps API without modifying the key
      const response = await axios.get(
        `https://maps.googleapis.com${req.originalUrl}`
      );
      console.log("Response received from Google Maps API.");
      res.status(response.status).json(response.data);
    } catch (error) {
      console.error("Error passing through API request:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Cleanup and disconnect from Redis when the app is terminated
  const cleanup = async () => {
    console.log("Cleaning up before exiting...");
    if (useRedis && redisClient) {
      await redisClient.disconnect();
      console.log("Redis client disconnected.");
    }
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  return app;
}

// If the file is run directly, start the server
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  createServer().then((app) => {
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  });
}

module.exports = createServer;
