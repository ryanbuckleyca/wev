import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import toast from 'react-hot-toast'
import DeleteAccountModal from './DeleteAccountModal'

// Mock dependencies
vi.mock('next-intl', () => ({
  useTranslations: vi.fn()
}))

vi.mock('@/i18n/navigation', () => ({
  useRouter: vi.fn()
}))

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn()
  }
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      signOut: vi.fn()
    }
  }))
}))

// Mock fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock window.location
Object.defineProperty(window, 'location', {
  value: {
    href: ''
  },
  writable: true
})

describe('DeleteAccountModal', () => {
  const mockPush = vi.fn()
  const mockT = vi.fn((key: string) => {
    const translations: Record<string, string> = {
      'deleteAccount.title': 'Delete Account',
      'deleteAccount.warning': 'This action will permanently delete:',
      'deleteAccount.warningProfile': 'Your profile and personal information',
      'deleteAccount.warningBookmarks': 'All your bookmarked jobs',
      'deleteAccount.warningMatches': 'Your job match history',
      'deleteAccount.warningIrreversible': 'This action cannot be undone',
      'deleteAccount.passwordLabel': 'Enter your password',
      'deleteAccount.passwordPlaceholder': 'Current password',
      'deleteAccount.confirmLabel': 'Type DELETE to confirm',
      'deleteAccount.confirmHelp': 'Type the word DELETE in capital letters to confirm deletion',
      'deleteAccount.confirm': 'Delete Account',
      'deleteAccount.deleting': 'Deleting...',
      'deleteAccount.passwordRequired': 'Password is required to delete your account',
      'deleteAccount.confirmationRequired': 'Please type DELETE to confirm',
      'deleteAccount.success': 'Account deleted successfully',
      'deleteAccount.error': 'Failed to delete account. Please try again.',
      'common.cancel': 'Cancel'
    }
    return translations[key] || key
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useTranslations).mockReturnValue(mockT)
    vi.mocked(useRouter).mockReturnValue({ push: mockPush })
    mockFetch.mockClear()
    window.location.href = ''
  })

  it('should not render when isOpen is false', () => {
    render(<DeleteAccountModal isOpen={false} onClose={vi.fn()} />)
    
    expect(screen.queryByText('Delete Account')).not.toBeInTheDocument()
  })

  it('should render modal content when isOpen is true', () => {
    render(<DeleteAccountModal isOpen={true} onClose={vi.fn()} />)
    
    expect(screen.getByText('Delete Account')).toBeInTheDocument()
    expect(screen.getByText('This action will permanently delete:')).toBeInTheDocument()
    expect(screen.getByText('Your profile and personal information')).toBeInTheDocument()
    expect(screen.getByText('All your bookmarked jobs')).toBeInTheDocument()
    expect(screen.getByText('Your job match history')).toBeInTheDocument()
    expect(screen.getByText('This action cannot be undone')).toBeInTheDocument()
    
    expect(screen.getByLabelText('Enter your password')).toBeInTheDocument()
    expect(screen.getByLabelText('Type DELETE to confirm')).toBeInTheDocument()
    expect(screen.getByText('Type the word DELETE in capital letters to confirm deletion')).toBeInTheDocument()
    
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete Account' })).toBeInTheDocument()
  })

  it('should close modal when cancel button is clicked', () => {
    const mockOnClose = vi.fn()
    render(<DeleteAccountModal isOpen={true} onClose={mockOnClose} />)
    
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('should show error when password is missing', async () => {
    render(<DeleteAccountModal isOpen={true} onClose={vi.fn()} />)
    
    // Fill confirmation text but leave password empty
    const confirmInput = screen.getByPlaceholderText('DELETE')
    fireEvent.change(confirmInput, { target: { value: 'DELETE' } })
    
    fireEvent.click(screen.getByRole('button', { name: 'Delete Account' }))
    
    await waitFor(() => {
      expect(screen.getByText('Password is required to delete your account')).toBeInTheDocument()
    })
  })

  it('should show error when confirmation text is incorrect', async () => {
    render(<DeleteAccountModal isOpen={true} onClose={vi.fn()} />)
    
    // Fill password but wrong confirmation text
    const passwordInput = screen.getByPlaceholderText('Current password')
    const confirmInput = screen.getByPlaceholderText('DELETE')
    
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.change(confirmInput, { target: { value: 'WRONG' } })
    
    fireEvent.click(screen.getByRole('button', { name: 'Delete Account' }))
    
    await waitFor(() => {
      expect(screen.getByText('Please type DELETE to confirm')).toBeInTheDocument()
    })
  })

  it('should disable delete button when form is invalid', () => {
    render(<DeleteAccountModal isOpen={true} onClose={vi.fn()} />)
    
    const deleteButton = screen.getByRole('button', { name: 'Delete Account' })
    const passwordInput = screen.getByPlaceholderText('Current password')
    const confirmInput = screen.getByPlaceholderText('DELETE')
    
    expect(deleteButton).toBeDisabled()
    
    // Fill password only
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    expect(deleteButton).toBeDisabled()
    
    // Fill confirmation text only
    fireEvent.change(passwordInput, { target: { value: '' } })
    fireEvent.change(confirmInput, { target: { value: 'DELETE' } })
    expect(deleteButton).toBeDisabled()
    
    // Fill both correctly
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.change(confirmInput, { target: { value: 'DELETE' } })
    expect(deleteButton).not.toBeDisabled()
  })

  it('should successfully delete account', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'Account successfully deleted' })
    })

    render(<DeleteAccountModal isOpen={true} onClose={vi.fn()} />)
    
    // Fill form correctly
    const passwordInput = screen.getByPlaceholderText('Current password')
    const confirmInput = screen.getByPlaceholderText('DELETE')
    
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.change(confirmInput, { target: { value: 'DELETE' } })
    
    fireEvent.click(screen.getByRole('button', { name: 'Delete Account' }))
    
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/account/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: 'password123' }),
      })
    })

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Account deleted successfully')
      expect(window.location.href).toBe('/')
    })
  })

  it('should handle API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Invalid password' })
    })

    render(<DeleteAccountModal isOpen={true} onClose={vi.fn()} />)
    
    // Fill form correctly
    const passwordInput = screen.getByPlaceholderText('Current password')
    const confirmInput = screen.getByPlaceholderText('DELETE')
    
    fireEvent.change(passwordInput, { target: { value: 'wrongpassword' } })
    fireEvent.change(confirmInput, { target: { value: 'DELETE' } })
    
    fireEvent.click(screen.getByRole('button', { name: 'Delete Account' }))
    
    await waitFor(() => {
      expect(screen.getByText('Invalid password')).toBeInTheDocument()
    })
  })

  it('should handle network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    render(<DeleteAccountModal isOpen={true} onClose={vi.fn()} />)
    
    // Fill form correctly
    const passwordInput = screen.getByPlaceholderText('Current password')
    const confirmInput = screen.getByPlaceholderText('DELETE')
    
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.change(confirmInput, { target: { value: 'DELETE' } })
    
    fireEvent.click(screen.getByRole('button', { name: 'Delete Account' }))
    
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument()
    })
  })

  it('should accept SUPPRIMER as confirmation text for French', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: 'Account successfully deleted' })
    })

    // Mock French translation
    mockT.mockImplementation((key: string) => {
      if (key === 'deleteAccount.confirmLabel') return 'Tapez SUPPRIMER pour confirmer'
      return key
    })

    render(<DeleteAccountModal isOpen={true} onClose={vi.fn()} />)
    
    // Fill form with French confirmation
    const passwordInput = screen.getByPlaceholderText('Current password')
    const confirmInput = screen.getByPlaceholderText('SUPPRIMER')
    
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.change(confirmInput, { target: { value: 'SUPPRIMER' } })
    
    fireEvent.click(screen.getByRole('button', { name: 'Delete Account' }))
    
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled()
    })
  })

  it('should show loading state during deletion', async () => {
    // Mock a delayed response
    mockFetch.mockImplementation(() => 
      new Promise(resolve => 
        setTimeout(() => resolve({
          ok: true,
          json: async () => ({ message: 'Account successfully deleted' })
        }), 100)
      )
    )

    render(<DeleteAccountModal isOpen={true} onClose={vi.fn()} />)
    
    // Fill form correctly
    const passwordInput = screen.getByPlaceholderText('Current password')
    const confirmInput = screen.getByPlaceholderText('DELETE')
    
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.change(confirmInput, { target: { value: 'DELETE' } })
    
    fireEvent.click(screen.getByRole('button', { name: 'Delete Account' }))
    
    // Should show loading state
    expect(screen.getByRole('button', { name: 'Deleting...' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Deleting...' })).toBeDisabled()
    
    // Wait for completion
    await waitFor(() => {
      expect(window.location.href).toBe('/')
    }, { timeout: 200 })
  })

  it('should clear form when modal is closed and reopened', () => {
    const mockOnClose = vi.fn()
    const { rerender } = render(<DeleteAccountModal isOpen={true} onClose={mockOnClose} />)
    
    // Fill form
    const passwordInput = screen.getByPlaceholderText('Current password')
    const confirmInput = screen.getByPlaceholderText('DELETE')
    
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.change(confirmInput, { target: { value: 'DELETE' } })
    
    // Close modal
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(mockOnClose).toHaveBeenCalled()
    
    // Reopen modal
    rerender(<DeleteAccountModal isOpen={false} onClose={mockOnClose} />)
    rerender(<DeleteAccountModal isOpen={true} onClose={mockOnClose} />)
    
    // Form should be cleared
    expect(screen.getByPlaceholderText('Current password')).toHaveValue('')
    expect(screen.getByPlaceholderText('DELETE')).toHaveValue('')
  })
})