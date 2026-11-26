import { Redirect } from 'expo-router';

/** The Profile tab opens the profile screen (its tab button pushes it); a direct link lands here. */
export default function MeTab() {
  return <Redirect href="/profile" />;
}
