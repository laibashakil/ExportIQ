// Opens Gmail's web compose window in a new browser tab with the
// to/subject/body pre-filled. This never SENDS the email — it only hands a
// pre-filled compose screen to Gmail. The user reviews and sends it from
// their signed-in Gmail account.
export function openGmailCompose({ to = '', subject = '', body = '' }) {
  const url =
    'https://mail.google.com/mail/?view=cm&fs=1'
    + `&to=${encodeURIComponent(to)}`
    + `&su=${encodeURIComponent(subject)}`
    + `&body=${encodeURIComponent(body)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}
