import { Switch, type SwitchProps } from 'react-native';
import { color } from '@/theme';

/**
 * The app's on/off switch in brand colors on every platform. React Native Web colours the
 * thumb with `activeThumbColor` (not `thumbColor`), otherwise it shows its default teal.
 */
export function Toggle(props: SwitchProps) {
  const web = { activeThumbColor: color.text.primary, activeTrackColor: color.accent[500] };
  return (
    <Switch
      trackColor={{ true: color.accent[500], false: color.border.strong }}
      thumbColor={color.text.primary}
      ios_backgroundColor={color.border.strong}
      {...(web as object)}
      {...props}
    />
  );
}
