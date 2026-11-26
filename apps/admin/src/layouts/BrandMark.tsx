import { usePublicClub } from '@/lib/club';
import logo from '../../../../assets/brand/grit-logo-orange.png';
import { PlatformLogo } from './PlatformLogo';

/**
 * The admin is the Metis Fit product: its own logo is always Metis Fit (we show our brand to
 * every gym). The gym's own logo appears next to the gym's name (see `ClubMark`).
 */
export function BrandMark({ className, markOnly }: { className?: string; markOnly?: boolean }) {
  return <PlatformLogo className={className} markOnly={markOnly} />;
}

/**
 * The gym's logo: the one the gym uploaded (Club settings), else GRIT's built-in logo for the
 * original gym, else nothing (the gym's name is shown instead).
 */
export function ClubMark({ className }: { className?: string }) {
  const club = usePublicClub();
  const name = typeof club.data?.info.short_name === 'string' ? club.data.info.short_name : '';
  if (club.data?.logoUrl)
    return <img src={club.data.logoUrl} alt={name} className={className} draggable={false} />;
  if (club.data?.isDefault)
    return <img src={logo} alt={name} className={className} draggable={false} />;
  return null;
}

/** At the gym's door (kiosk): the gym's logo when it has one, else Metis Fit. */
export function GymOrPlatformMark({ className }: { className?: string }) {
  const club = usePublicClub();
  if (club.data?.logoUrl || club.data?.isDefault) return <ClubMark className={className} />;
  return <PlatformLogo className={className} />;
}
