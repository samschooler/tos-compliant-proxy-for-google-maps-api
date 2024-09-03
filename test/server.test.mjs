import { expect } from "chai";
import sinon from "sinon";
import supertest from "supertest";
import nock from "nock";
import createServer from "../src/index.js"; // Ensure your server file has a `.js` extension

describe("Express Server", function () {
  let app;
  let request;

  before(async function () {
    app = await createServer({ redisUrl: null }); // Create the server without Redis
    request = supertest(app);
  });

  afterEach(function () {
    sinon.restore();
  });

  it("should return cached data if present", async function () {
    const cacheClientStub = sinon.stub();
    cacheClientStub.get = sinon.stub().resolves({
      place_id: "test_place_id",
      name: "Test Place",
    });

    const appWithCacheStub = await createServer({
      cacheClient: cacheClientStub,
      redisUrl: null,
    });

    const response = await supertest(appWithCacheStub)
      .get("/maps/api/place/details/json")
      .query({
        place_id: "test_place_id",
        fields: "place_id,name",
        key: "test_key",
      });

    expect(response.status).to.equal(200);
    expect(response.body).to.deep.equal({
      place_id: "test_place_id",
      name: "Test Place",
    });
  });

  it("should fetch and cache data if not present in cache", async function () {
    const cacheClientStub = sinon.stub();
    cacheClientStub.get = sinon.stub().resolves(null); // Simulate cache miss
    cacheClientStub.set = sinon.stub().resolves();

    const googleMapsApiMock = nock("https://maps.googleapis.com")
      .get("/maps/api/place/details/json")
      .query({
        place_id: "test_place_id",
        fields: "place_id,name",
        key: "test_key",
      })
      .reply(200, {
        result: {
          place_id: "test_place_id",
          name: "Test Place",
        },
        status: "OK",
      });

    const appWithCacheStub = await createServer({
      cacheClient: cacheClientStub,
      redisUrl: null,
    });

    const response = await supertest(appWithCacheStub)
      .get("/maps/api/place/details/json")
      .query({
        place_id: "test_place_id",
        fields: "place_id,name",
        key: "test_key",
      });

    expect(response.status).to.equal(200);
    expect(response.body).to.deep.equal({
      place_id: "test_place_id",
      name: "Test Place",
    });

    expect(cacheClientStub.set.calledOnce).to.be.true; // Ensure the data was cached
    googleMapsApiMock.done(); // Ensure the mock was called
  });

  it("should return an error if place_id or key is missing", async function () {
    const response = await request.get("/maps/api/place/details/json");

    expect(response.status).to.equal(400);
    expect(response.body).to.have.property("error");
  });

  it("should return an error if Google Maps API returns an error", async function () {
    nock("https://maps.googleapis.com")
      .get("/maps/api/place/details/json")
      .query({
        place_id: "invalid_place_id",
        fields: "place_id,name",
        key: "test_key",
      })
      .reply(400, { status: "INVALID_REQUEST" });

    const response = await request.get("/maps/api/place/details/json").query({
      place_id: "invalid_place_id",
      fields: "place_id,name",
      key: "test_key",
    });

    expect(response.status).to.equal(400);
    expect(response.body).to.deep.equal({
      error: "Failed to fetch data from Google Maps API",
      details: "INVALID_REQUEST",
    });
  });

  it("should proxy requests to the Google Maps API", async function () {
    nock("https://maps.googleapis.com")
      .get("/maps/api/some/other/endpoint")
      .query({ key: "test_key" })
      .reply(200, { status: "OK", result: "Some data" });

    const response = await request
      .get("/maps/api/some/other/endpoint")
      .query({ key: "test_key" });

    expect(response.status).to.equal(200);
    expect(response.body).to.deep.equal({
      status: "OK",
      result: "Some data",
    });
  });
});
