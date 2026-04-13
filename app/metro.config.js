const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Enable package exports so Firebase v9+ subpath imports (firebase/app, firebase/auth, etc.) resolve correctly.
// We no longer use @supabase/realtime-js so the old workaround is removed.
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
