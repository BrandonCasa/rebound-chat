import type { StackProps } from "aws-cdk-lib";

import type { ReboundEnvironmentConfig } from "./config";

export interface ReboundStackProps extends StackProps {
	config: ReboundEnvironmentConfig;
}
