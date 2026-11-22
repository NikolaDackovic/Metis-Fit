import { Image, type ImageStyle, type StyleProp } from 'react-native';
import { useClub } from '@/lib/queries';
import logo from '../../assets/grit-logo.png';
import { PlatformLogo } from './PlatformLogo';

/**
 * The gym's logo: the uploaded one, else GRIT's built-in logo for the original gym, else the
 * platform logo (a gym that has not uploaded one yet). `height` sizes the platform logo.
 */
export function ClubLogo({ style, height }: { style: StyleProp<ImageStyle>; height: number }) {
  const club = useClub();
  if (club.data?.logoUrl)
    return (
      <Image
        source={{ uri: club.data.logoUrl }}
        style={style}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    );
  if (club.data && club.data.isDefault === false) return <PlatformLogo height={height} markOnly />;
  return (
    <Image source={logo} style={style} resizeMode="contain" accessibilityIgnoresInvertColors />
  );
}
