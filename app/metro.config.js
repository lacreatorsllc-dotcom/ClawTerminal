const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Enable package exports so Firebase v9+ subpath imports (firebase/app, firebase/auth, etc.) resolve correctly.
config.resolver.unstable_enablePackageExports = true;

// Web shims — swap native-only modules with no-op stubs on web
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web') {
    const webShims = {
      'expo-file-system': path.resolve(__dirname, 'shims/expo-file-system.web.js'),
      'expo-media-library': path.resolve(__dirname, 'shims/expo-media-library.web.js'),
    };
    if (webShims[moduleName]) {
      return { filePath: webShims[moduleName], type: 'sourceFile' };
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
