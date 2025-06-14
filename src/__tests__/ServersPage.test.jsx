import { render, screen } from "@testing-library/react";
import { describe, test, expect } from "vitest";
import ServersPage from "../routes/ServersPage/ServersPage.route.jsx";

describe("Servers page", () => {
    test("renders sample servers", () => {
        render(<ServersPage />);
        expect(screen.getByText("Rebound HQ")).toBeInTheDocument();
        expect(screen.getByText("Dev Corner")).toBeInTheDocument();
        expect(screen.getByText("welcome")).toBeInTheDocument();
        expect(screen.getByText("help")).toBeInTheDocument();
    });
});
