const appConfig = require('./app.json');

module.exports = {
  ...appConfig.expo,
  android: {
    ...appConfig.expo.android,
    // EAS Build: uses path from GOOGLE_SERVICES_JSON env var (file uploaded to EAS)
    // Local dev: falls back to ./google-services.json in project
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
  },
};
