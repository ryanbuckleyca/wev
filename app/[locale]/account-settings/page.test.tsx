import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@/test-utils'
import userEvent from '@testing-library/user-event'
import AccountSettingsPage from './page'

// Mock the auth hook
vi.mock('@/lib/hooks/useRequireAuth', () => ({
  useRequireAuth: vi.fn(() => ({
    user: { 
      id: 'user-123', 
      email: 'test@example.com' 
    },
    loading: false
  }))
}))

// Mock Supabase client
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      updateUser: vi.fn()
    }
  }))
}))

// Mock password strength hook
vi.mock('@/hooks/usePasswordStrength', () => ({
  usePasswordStrength: vi.fn(() => ({
    isAcceptable: true,
    score: 4
  }))
}))

// Mock toast
vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn()
  }
}))

// Mock DeleteAccountModal
vi.mock('@/components/DeleteAccountModal', () => ({
  default: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => (
    isOpen ? (
      <div role="dialog" aria-label="Delete Account Modal">
        <h2>Delete Account Modal</h2>
        <button onClick={onClose}>Close Modal</button>
      </div>
    ) : null
  )
}))

describe('AccountSettingsPage', () => {
  const user = userEvent.setup()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders account settings form', () => {
    render(<AccountSettingsPage />)
    
    expect(screen.getByRole('heading', { name: /account settings/i })).toBeVisible()
    expect(screen.getByText(/email address/i)).toBeVisible()
    expect(screen.getByText(/change password/i)).toBeVisible()
    expect(screen.getByText(/current email:/i)).toBeVisible()
    expect(screen.getByText('test@example.com')).toBeVisible()
    
    expect(screen.getByPlaceholderText(/enter new email/i)).toBeVisible()
    expect(screen.getByPlaceholderText(/enter current password/i)).toBeVisible()
    expect(screen.getByPlaceholderText(/enter new password/i)).toBeVisible()
    expect(screen.getByPlaceholderText(/confirm new password/i)).toBeVisible()
    
    expect(screen.getByRole('button', { name: /save changes/i })).toBeVisible()
  })

  it('renders delete account section', () => {
    render(<AccountSettingsPage />)
    
    expect(screen.getByRole('heading', { name: /delete account/i })).toBeVisible()
    expect(screen.getByText(/permanently delete your account and all associated data/i)).toBeVisible()
    expect(screen.getByRole('button', { name: /delete account/i })).toBeVisible()
  })

  it('delete account section has danger styling', () => {
    render(<AccountSettingsPage />)
    
    const deleteButton = screen.getByRole('button', { name: /delete account/i })
    expect(deleteButton).toHaveClass('bg-wev-destructive-tint', 'text-destructive-foreground', 'border-none')
    
    // Check that the section has red styling
    const deleteSection = screen.getByRole('heading', { name: /delete account/i }).closest('div')
    expect(deleteSection).toHaveClass('border-red-200', 'bg-red-50')
  })

  it('opens delete account modal when delete button is clicked', async () => {
    render(<AccountSettingsPage />)
    
    const deleteButton = screen.getByRole('button', { name: /delete account/i })
    await user.click(deleteButton)
    
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /delete account modal/i })).toBeVisible()
      expect(screen.getByText('Delete Account Modal')).toBeVisible()
    })
  })

  it('closes delete account modal when close is clicked', async () => {
    render(<AccountSettingsPage />)
    
    // Open modal
    const deleteButton = screen.getByRole('button', { name: /delete account/i })
    await user.click(deleteButton)
    
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /delete account modal/i })).toBeVisible()
    })
    
    // Close modal
    const closeButton = screen.getByText('Close Modal')
    await user.click(closeButton)
    
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /delete account modal/i })).not.toBeInTheDocument()
    })
  })

  it('has save button disabled when no changes are made', () => {
    render(<AccountSettingsPage />)
    
    const saveButton = screen.getByRole('button', { name: /save changes/i })
    expect(saveButton).toBeDisabled()
  })

  it('enables save button when email is changed', async () => {
    render(<AccountSettingsPage />)
    
    const emailInput = screen.getByPlaceholderText(/enter new email/i)
    const saveButton = screen.getByRole('button', { name: /save changes/i })
    
    expect(saveButton).toBeDisabled()
    
    await user.clear(emailInput)
    await user.type(emailInput, 'newemail@example.com')
    
    expect(saveButton).not.toBeDisabled()
  })

  it('shows current email in the form', () => {
    render(<AccountSettingsPage />)
    
    const emailInput = screen.getByPlaceholderText(/enter new email/i)
    expect(emailInput).toHaveValue('test@example.com')
  })
})
