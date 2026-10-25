// Spread onto plain text inputs (names, nicknames) so browsers and password
// managers (1Password, LastPass, Bitwarden, Dashlane) don't treat them as login fields.
export const noAutofill = {
  autoComplete: 'off',
  'data-1p-ignore': true,
  'data-lpignore': 'true',
  'data-bwignore': 'true',
  'data-form-type': 'other',
} as const
