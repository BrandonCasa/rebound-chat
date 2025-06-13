import { renderHook, waitFor } from "@testing-library/react";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { useFilePreview } from "../components/User/useProfileCard.js";

vi.mock("../helpers/cacheMedia");
import cacheMedia from "../helpers/cacheMedia";

beforeEach(() => {
    vi.clearAllMocks();
});

afterEach(() => {
    vi.clearAllMocks();
});

describe("useFilePreview", () => {
    test("loads and caches media", async () => {
        cacheMedia.mockResolvedValue("cached-url");
        const { result } = renderHook(() => useFilePreview("http://example.com/img.png"));
        await waitFor(() => {
            expect(cacheMedia).toHaveBeenCalledWith("http://example.com/img.png");
            expect(result.current.preview).toBe("cached-url");
        });
    });
});
