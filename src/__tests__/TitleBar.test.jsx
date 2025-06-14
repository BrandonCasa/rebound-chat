import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { describe, test, expect } from "vitest";
import rootReducer from "../slices";
import TitleBar from "../components/TitleBar.jsx";

describe("TitleBar", () => {
    test("displays notification count", () => {
        const store = configureStore({
            reducer: rootReducer,
            preloadedState: { snackbars: { snackbarList: { 1: {} } } },
        });
        render(
            <Provider store={store}>
                <TitleBar />
            </Provider>
        );
        expect(screen.getByText("1")).toBeInTheDocument();
    });
});
