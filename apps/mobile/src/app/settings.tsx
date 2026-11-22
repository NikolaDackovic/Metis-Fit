import { Redirect } from 'expo-router';

/** Settings now live in Profile (one place for account, notifications, language and privacy). */
export default function SettingsScreen() {
  return <Redirect href="/profile" />;
}
