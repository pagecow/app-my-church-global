// `config` is the "expo" object of app.json. Taking it as the argument (instead
// of require('./app.json')) is the form `expo-doctor` recognises as "the dynamic
// config uses the static one"; the resulting config is the same.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    // EAS Build: uses path from GOOGLE_SERVICES_JSON env var (file uploaded to EAS)
    // Local dev: falls back to ./google-services.json in project
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
  },
});
