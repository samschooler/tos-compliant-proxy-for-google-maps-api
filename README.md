# tos-compliant-proxy-for-google-maps-api

# THIS IS A WORK IN PROGRESS

TOS-Compliant Proxy for Google Maps API is a Node.js middleware designed to act as a transparent proxy for the Google Maps API. It allows developers to implement caching strategies that comply with Google Maps Platform's Terms of Service (TOS). The middleware supports caching of specific fields, handles API key management by allowing the client to pass their own API key, and ensures that non-cacheable fields trigger a refresh of cached data.
Features:

- Field-Level Caching: Efficiently cache responses based on specific fields (e.g., formatted_address, lat, lng) to reduce API call frequency and improve application performance.
- API Key Passthrough: No need to hardcode API keys in your server. Clients can pass their own API key directly through the proxy, enhancing security and flexibility.
- TOS Compliance: Automatically handles cache invalidation when non-cacheable fields are requested, ensuring compliance with Google Maps Platform's terms.
- Redis Integration: Leverages Redis as a caching backend for scalability and persistence, making it suitable for distributed systems.
- Flexible Proxying: Passes through all other API requests without modification, allowing for seamless integration with existing applications.

# Use Cases:

- Building efficient and compliant server-side proxies for applications that rely heavily on Google Maps API.
- Reducing API costs by caching frequently requested data, while still adhering to Google’s TOS.
- Enhancing security by allowing clients to manage their own API keys without exposing them in the backend code.

# Installation:

```bash
npm install tos-compliant-proxy-for-google-maps-api
```

# Supported Endpoints

- `/maps/api/place/details/json`

# Configuration

### Environment Variables

- `REDIS_URL`: The URL of your Redis server. If not provided, the middleware will use NodeCache for caching.

### API Key

To use the proxy, you need to obtain an API key from Google Maps Platform. You can do this by creating a new project and enabling the Google Maps JavaScript API. Once you have your API key, you can pass it to the proxy as an environment variable or directly in the request.

# Usage

### As a Standalone Server

```bash
npx tos-compliant-proxy-for-google-maps-api
```

### As a Middleware

```javascript
const express = require("express");
const createGoogleMapsProxy = require("tos-compliant-proxy-for-google-maps-api");

const app = express();

// Use the proxy as middleware
app.use("/maps/api", createGoogleMapsProxy());

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
```

Simply integrate this middleware into your Express.js application to start proxying and caching Google Maps API requests in a compliant manner.
