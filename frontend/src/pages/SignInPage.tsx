import { SignIn, SignUp } from '@clerk/clerk-react'
import Layout from '../components/Layout'

/** Clerk's own widget, themed to match. Sign-in and sign-up are the same page in
 *  two modes -- GitHub and everything else are enabled in the Clerk dashboard, not
 *  here, so adding a provider never needs a deploy. */
export default function SignInPage({ mode = 'sign-in' }: { mode?: 'sign-in' | 'sign-up' }) {
  return (
    <Layout>
      <div className="flex justify-center py-12">
        {mode === 'sign-up' ? (
          <SignUp signInUrl="/login" forceRedirectUrl="/?add=1" />
        ) : (
          <SignIn signUpUrl="/register" forceRedirectUrl="/" />
        )}
      </div>
    </Layout>
  )
}
