package enums

type Environment string

// Values: DEVELOPMENT STAGING PRODUCTION
const (
	EnvironmentDevelopment Environment = "DEVELOPMENT"
	EnvironmentStaging     Environment = "STAGING"
	EnvironmentProduction  Environment = "PRODUCTION"
)
