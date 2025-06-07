import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Mock MUI icons to avoid opening thousands of files during tests, which can
// exceed the file handle limit on some systems (e.g. Windows). Every requested
// icon will resolve to a simple component stub.
vi.mock("@mui/icons-material", () =>
  new Proxy({}, {
    get: () => () => null,
  })
);
