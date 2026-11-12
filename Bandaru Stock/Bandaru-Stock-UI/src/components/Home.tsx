import { useState } from 'react'
import type { ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import './Home.css'

interface Portal {
  key: 'admin' | 'merchant' | 'customer'
  title: string
  description: string
  buttonLabel: string
  loginPath: string
  icon: ReactElement
}

const AdminIcon = () => (
  <svg className="portal-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 2 4 5v6c0 5 3.5 9.5 8 11 4.5-1.5 8-6 8-11V5l-8-3Z" strokeLinejoin="round" />
    <circle cx="12" cy="11" r="2" />
    <path d="M12 13v3" strokeLinecap="round" />
  </svg>
)

const MerchantIcon = () => (
  <svg className="portal-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 9h18l-1.5-5h-15L3 9Z" strokeLinejoin="round" />
    <path d="M4 9v10h16V9" strokeLinejoin="round" />
    <path d="M9 19v-5h6v5" strokeLinejoin="round" />
    <path d="M3 9c0 1.3 1 2.5 2.5 2.5S8 10.3 8 9c0 1.3 1 2.5 2.5 2.5S13 10.3 13 9c0 1.3 1 2.5 2.5 2.5S18 10.3 18 9" />
  </svg>
)

const CustomerIcon = () => (
  <svg className="portal-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" strokeLinecap="round" />
  </svg>
)

const HelpIcon = () => (
  <svg className="home-help-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <path d="M9.5 9.5a2.5 2.5 0 0 1 4.9.8c0 1.7-2.4 1.7-2.4 3.2" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
  </svg>
)

const BrandIcon = () => (
  <svg className="home-brand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="4" width="9" height="7" rx="1" />
    <rect x="13" y="13" width="9" height="7" rx="1" />
    <path d="M6.5 11v3M17.5 13v-3" strokeLinecap="round" />
  </svg>
)

const BackIcon = () => (
  <svg className="back-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M15 6 9 12l6 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const PORTALS: Portal[] = [
  {
    key: 'admin',
    title: 'Bandaru Stock Admin',
    description:
      'Secure access for system administrators to manage global platform settings and monitor network health.',
    buttonLabel: 'Login as Admin',
    loginPath: '/admin/login',
    icon: <AdminIcon />,
  },
  {
    key: 'merchant',
    title: 'Merchant Portal',
    description:
      'Business-oriented tools to manage stock offerings, track trade volumes, and oversee institutional accounts.',
    buttonLabel: 'Login as Merchant',
    loginPath: '/merchant/login',
    icon: <MerchantIcon />,
  },
  {
    key: 'customer',
    title: 'Customer Portal',
    description:
      'Approachable, secure access for retail investors to monitor portfolios, execute trades, and review history.',
    buttonLabel: 'Login as Customer',
    loginPath: '/customer/login',
    icon: <CustomerIcon />,
  },
]

/** Formats a raw digit string into the Indian mobile format: 00000-00000 (max 10 digits). */
function formatIndianPhone(rawDigits: string): string {
  const digits = rawDigits.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 5) return digits
  return `${digits.slice(0, 5)}-${digits.slice(5)}`
}

function Home() {
  const navigate = useNavigate()
  const [activePortal, setActivePortal] = useState<Portal | null>(null)
  const [phone, setPhone] = useState('')

  const handleSelectPortal = (portal: Portal) => {
    setActivePortal(portal)
    setPhone('')
  }

  const handleBack = () => {
    setActivePortal(null)
    setPhone('')
  }

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(formatIndianPhone(e.target.value))
  }

  const isPhoneValid = phone.replace(/\D/g, '').length === 10

  const handleContinue = () => {
    if (!activePortal || !isPhoneValid) return
    // TODO: replace with real OTP/auth request once Auth Service is wired up.
    // All portals currently land on the same directory/dashboard shell until
    // portal-specific dashboards are built.
    navigate('/merchant/directory')
  }

  return (
    <div className="home-page">
      <header className="home-header">
        <div className="home-brand">
          <BrandIcon />
          <span>Bandaru Stock</span>
        </div>
        <HelpIcon />
      </header>

      <main className="home-main">
        <h1 className="home-title">Welcome to Bandaru Stock</h1>
        <p className="home-subtitle">
          Select your portal to securely access your account and manage your financial instruments.
        </p>

        <div className="portal-cards">
          {PORTALS.map((portal) => {
            const isActive = activePortal?.key === portal.key
            return (
              <div className={`portal-card${isActive ? ' portal-card-login' : ''}`} key={portal.key}>
                {isActive && (
                  <button type="button" className="back-link" onClick={handleBack}>
                    <BackIcon />
                    Back
                  </button>
                )}
                <div className={`portal-icon-wrap ${portal.key}`}>{portal.icon}</div>
                <h2 className="portal-title">{portal.title}</h2>
                <p className="portal-description">{portal.description}</p>

                {isActive ? (
                  <>
                    <div className="phone-field">
                      <label className="phone-label" htmlFor={`phone-input-${portal.key}`}>
                        Phone Number
                      </label>
                      <div className="phone-input-wrap">
                        <span className="phone-prefix">+91</span>
                        <input
                          id={`phone-input-${portal.key}`}
                          type="tel"
                          inputMode="numeric"
                          className="phone-input"
                          placeholder="00000-00000"
                          value={phone}
                          onChange={handlePhoneChange}
                          maxLength={11}
                          autoFocus
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      className="portal-login-btn"
                      disabled={!isPhoneValid}
                      onClick={handleContinue}
                    >
                      Continue
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="portal-login-btn"
                    onClick={() => handleSelectPortal(portal)}
                  >
                    {portal.buttonLabel}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </main>

      <footer className="home-footer">
        <span className="home-footer-brand">Bandaru Stock</span>
        <div className="home-footer-links">
          <a href="/terms">Terms of Service</a>
          <a href="/privacy">Privacy Policy</a>
          <a href="/support">Security Support</a>
        </div>
        <span className="home-footer-copyright">© 2024 Bandaru Stock. All rights reserved.</span>
      </footer>
    </div>
  )
}

export default Home
