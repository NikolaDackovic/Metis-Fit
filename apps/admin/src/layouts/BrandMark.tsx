import { usePublicClub } from '@/lib/club';
import logo from '../../../../assets/brand/grit-logo-orange.png';
import { PlatformLogo } from './PlatformLogo';

/**
 * The gym's logo inside the admin: the uploaded logo, else GRIT's built-in logo for the
 * original gym, else the platform logo (a new gym that has not uploaded one yet).
 */
export function BrandMark({ className }: { className?: string }) {
  const club = usePublicClub();
  const name = typeof club.data?.info.short_name === 'string' ? club.data.info.short_name : 'GRIT';
  if (club.data?.logoUrl)
    return <img src={club.data.logoUrl} alt={name} className={className} draggable={false} />;
  if (club.data && !club.data.isDefault) return <PlatformLogo className={className} markOnly />;
  return <img src={logo} alt={name} className={className} draggable={false} />;
}
