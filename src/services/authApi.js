import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

const baseUrl = process.env.NODE_ENV === "development" ? "http://localhost:6001/api" : "/api";

export const authApi = createApi({
  reducerPath: "authApi",
  baseQuery: fetchBaseQuery({ baseUrl }),
  endpoints: (builder) => ({
    verifyUser: builder.query({
      query: (token) => ({
        url: "/users/verify",
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Allow-Control-Allow-Origin": "*",
          authorization: `Bearer ${token}`,
        },
      }),
    }),
    loginUser: builder.mutation({
      query: (credentials) => ({
        url: "/users/login",
        method: "POST",
        body: credentials,
      }),
    }),
  }),
});

export const { useVerifyUserQuery, useLoginUserMutation } = authApi;
