import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import cacheMedia from "../helpers/cacheMedia.js";

let cacheStore;
let cacheObj;
let openSpy;

beforeEach(() => {
    cacheStore = new Map();
    cacheObj = {
        match: vi.fn((url) => Promise.resolve(cacheStore.get(url))),
        put: vi.fn((url, resp) => {
            cacheStore.set(url, resp);
            return Promise.resolve();
        }),
    };
    openSpy = vi.fn(() => Promise.resolve(cacheObj));
    global.caches = { open: openSpy };
    const res = { ok: true, blob: () => Promise.resolve(new Blob(["img"])) };
    res.clone = () => res;
    global.fetch = vi.fn(() => Promise.resolve(res));
    global.URL.createObjectURL = vi.fn(() => "blob:url");
});

afterEach(() => {
    delete global.caches;
    vi.restoreAllMocks();
});

describe("cacheMedia helper", () => {
    test("fetches and caches when not already cached", async () => {
        const url = "http://example.com/image.png";
        const result = await cacheMedia(url);
        expect(openSpy).toHaveBeenCalledWith("media-cache");
        expect(global.fetch).toHaveBeenCalledWith(url);
        expect(cacheObj.put).toHaveBeenCalled();
        expect(result).toBe("blob:url");
    });

    test("uses cached response when available", async () => {
        const url = "http://example.com/cached.png";
        const response = { ok: true, blob: () => Promise.resolve(new Blob(["img"])) };
        response.clone = () => response;
        cacheStore.set(url, response);
        const result = await cacheMedia(url);
        expect(global.fetch).not.toHaveBeenCalled();
        expect(result).toBe("blob:url");
    });
});
