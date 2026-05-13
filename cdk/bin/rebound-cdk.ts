#!/usr/bin/env node

import { App, Tags } from "aws-cdk-lib";

import { createReboundStacks } from "../lib/app";
import { getEnvironmentConfig } from "../lib/config";

const app = new App();
const config = getEnvironmentConfig(app);

Tags.of(app).add("Application", "Rebound");
Tags.of(app).add("Environment", config.appEnv);
Tags.of(app).add("ManagedBy", "cdk");

createReboundStacks(app, config);
