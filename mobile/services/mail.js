// Opens an email draft in the Gmail app with the to/subject/body pre-filled.
// Falls back to the OS default mail app (mailto:) when Gmail isn't installed.
//
// This never SENDS the email — it only hands a pre-filled compose screen to
// Gmail (or the default mail app). The user reviews and sends it themselves.
import { Linking, Alert } from 'react-native';

function mailtoUrl({ to, subject, body }) {
  return (
    `mailto:${encodeURIComponent(to)}`
    + `?subject=${encodeURIComponent(subject)}`
    + `&body=${encodeURIComponent(body)}`
  );
}

function gmailUrl({ to, subject, body }) {
  return (
    `googlegmail://co?to=${encodeURIComponent(to)}`
    + `&subject=${encodeURIComponent(subject)}`
    + `&body=${encodeURIComponent(body)}`
  );
}

/**
 * @param {{ to?: string, subject?: string, body?: string }} draft
 * @returns {Promise<boolean>} true if an app was opened with the draft
 */
export async function openInGmail({ to = '', subject = '', body = '' }) {
  const draft = { to, subject, body };

  // Prefer the Gmail app when it's installed on the device.
  try {
    const hasGmail = await Linking.canOpenURL('googlegmail://').catch(() => false);
    if (hasGmail) {
      await Linking.openURL(gmailUrl(draft));
      return true;
    }
  } catch {
    // fall through to the default mail app
  }

  // Fallback: the OS default mail app via mailto:.
  try {
    await Linking.openURL(mailtoUrl(draft));
    return true;
  } catch (e) {
    Alert.alert(
      'Could not open email app',
      'No email app was found on this device to open the draft.',
    );
    return false;
  }
}
