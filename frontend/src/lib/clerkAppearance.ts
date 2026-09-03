import type { ClerkProviderProps } from '@clerk/clerk-react'

/** Clerk's widgets, wearing the quiet UI: no radius, hairline borders, one purple. */
export const clerkAppearance: NonNullable<ClerkProviderProps['appearance']> = {
  variables: {
    colorPrimary: 'var(--bright)',
    colorBackground: 'var(--bar)',
    colorText: 'var(--ink)',
    colorTextSecondary: 'var(--muted)',
    colorInputBackground: 'var(--raised)',
    colorInputText: 'var(--ink)',
    colorDanger: 'var(--timer)',
    borderRadius: '0',
    fontFamily: '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif',
  },
  elements: {
    card: { border: '1px solid var(--line)', boxShadow: 'none' },
    formButtonPrimary: { boxShadow: 'none', textTransform: 'none' },
    socialButtonsBlockButton: { border: '1px solid var(--line)' },
    footerActionLink: { color: 'var(--ink-2)' },
  },
}
