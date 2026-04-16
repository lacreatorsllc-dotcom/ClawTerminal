// Web stub — expo-media-library is not available on web
export const requestPermissionsAsync = async () => ({ status: 'denied' });
export const getPermissionsAsync = async () => ({ status: 'denied' });
export const saveToLibraryAsync = async () => {};
export const createAssetAsync = async () => null;
export const getAssetsAsync = async () => ({ assets: [], endCursor: '', hasNextPage: false, totalCount: 0 });
export const PermissionStatus = { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' };
