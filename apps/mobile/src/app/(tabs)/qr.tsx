import { Redirect } from 'expo-router';

/** The middle tab button opens the entry card; this screen only exists for the tab route. */
export default function QrTab() {
  return <Redirect href="/card" />;
}
