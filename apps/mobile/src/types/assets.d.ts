// Static image imports (Metro resolves them to an asset id). Kept in the repo so typecheck works in CI,
// where Expo's generated expo-env.d.ts does not exist.
declare module '*.png' {
  import type { ImageSourcePropType } from 'react-native';
  const source: ImageSourcePropType;
  export default source;
}
declare module '*.jpg' {
  import type { ImageSourcePropType } from 'react-native';
  const source: ImageSourcePropType;
  export default source;
}
