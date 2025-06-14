import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { describe, test, expect } from "vitest";
import React from "react";
import LoginDialog from "../components/LoginDialog.comp";
import authReducer from "../slices/authSlice";
import dialogReducer from "../slices/dialogSlice";

describe("LoginDialog component", () => {
        test("renders Google login button", () => {
                const store = configureStore({
                        reducer: { auth: authReducer, dialogs: dialogReducer },
                        preloadedState: { dialogs: { loginDialogOpen: true } },
                });
                render(
                        <Provider store={store}>
                                <LoginDialog />
                        </Provider>
                );
                expect(screen.getByRole("button", { name: /sign in with google/i })).toBeInTheDocument();
        });
});
