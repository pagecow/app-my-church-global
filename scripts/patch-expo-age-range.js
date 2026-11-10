#!/usr/bin/env node
/**
 * Make expo-age-range installable on Expo SDK 54.
 *
 * The package is versioned 58.x and ships an autolinking config written for
 * SDK 58, which breaks this project in two independent ways:
 *
 *   1. `android.publication` has no `version` field. SDK 54's expo-module
 *      gradle plugin treats that field as required, so settings.gradle throws
 *      during configuration - before any code compiles. EAS reports this as
 *      "Gradle build failed with unknown error".
 *
 *   2. The Android AAR is compiled against Android API 37. SDK 54 builds
 *      against 35, so checkReleaseAarMetadata refuses to link it.
 *
 * Both are avoided by dropping Android from the module entirely. That costs
 * nothing here: Declared Age Range is an App Store requirement, and Play Age
 * Signals plays no part in an Apple review. lib/ageRange.ts returns 'unknown'
 * on Android before importing anything, so no native module is ever touched
 * there and the birth-date gate applies instead.
 *
 * Remove this script when the app moves to SDK 58, where upstream supports it.
 */
const fs = require("fs");
const path = require("path");

const CONFIG = path.join(
  __dirname,
  "..",
  "node_modules",
  "expo-age-range",
  "expo-module.config.json"
);

if (!fs.existsSync(CONFIG)) {
  // The dependency is absent (fresh clone before install, or removed
  // entirely) - nothing to patch, and a postinstall must not fail for it.
  process.exit(0);
}

const config = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
const alreadyPatched =
  JSON.stringify(config.platforms) === JSON.stringify(["apple"]) &&
  config.android === undefined;

if (alreadyPatched) {
  process.exit(0);
}

config.platforms = ["apple"];
delete config.android;

fs.writeFileSync(CONFIG, JSON.stringify(config, null, 2) + "\n");
console.log("expo-age-range: restricted to Apple platforms for SDK 54.");
