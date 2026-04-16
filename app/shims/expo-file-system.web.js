// Web stub — expo-file-system is not available on web
export const documentDirectory = null;
export const cacheDirectory = null;
export const bundleDirectory = null;
export const downloadAsync = async () => ({ uri: '', status: 200, headers: {}, md5: '' });
export const getInfoAsync = async () => ({ exists: false, isDirectory: false, uri: '', size: 0, modificationTime: 0 });
export const readAsStringAsync = async () => '';
export const writeAsStringAsync = async () => {};
export const deleteAsync = async () => {};
export const moveAsync = async () => {};
export const copyAsync = async () => {};
export const makeDirectoryAsync = async () => {};
export const readDirectoryAsync = async () => [];
export const createDownloadResumable = () => ({ downloadAsync: async () => null, pauseAsync: async () => {}, resumeAsync: async () => null, savable: () => ({}) });
