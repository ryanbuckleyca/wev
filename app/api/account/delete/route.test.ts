import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DELETE } from './route'
import { NextRequest } from 'next/server'

// Mock the Supabase modules
const mockGetUser = vi.fn()
const mockSelect = vi.fn()
const mockDelete = vi.fn()
const mockEq = vi.fn()
const mockSingle = vi.fn()
const mockFrom = vi.fn()
const mockRemove = vi.fn()
const mockDeleteUser = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser
    }
  }))
}))

vi.mock('@/lib/supabase-server', () => ({
  getSupabaseServer: vi.fn(() => ({
    from: mockFrom,
    storage: {
      from: vi.fn(() => ({
        remove: mockRemove
      }))
    },
    auth: {
      admin: {
        deleteUser: mockDeleteUser
      }
    }
  }))
}))

describe('/api/account/delete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Setup default mock chains
    mockEq.mockReturnValue({ single: mockSingle })
    mockSelect.mockReturnValue({ eq: mockEq })
    mockDelete.mockReturnValue({ eq: mockEq })
    mockFrom.mockReturnValue({ 
      select: mockSelect,
      delete: mockDelete
    })
  })

  it('should require authentication', async () => {
    // Mock unauthenticated user
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: new Error('Not authenticated')
    })

    const request = new NextRequest('http://localhost:3000/api/account/delete', {
      method: 'DELETE',
      body: JSON.stringify({ password: 'test123' })
    })

    const response = await DELETE(request)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Unauthorized')
  })

  it('should require password', async () => {
    // Mock authenticated user
    mockGetUser.mockResolvedValue({
      data: { 
        user: { 
          id: 'user-123', 
          email: 'test@example.com' 
        } 
      },
      error: null
    })

    const request = new NextRequest('http://localhost:3000/api/account/delete', {
      method: 'DELETE',
      body: JSON.stringify({}) // No password
    })

    const response = await DELETE(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Password required for account deletion')
  })

  it('should successfully delete account with password provided', async () => {
    // Mock authenticated user
    mockGetUser.mockResolvedValue({
      data: { 
        user: { 
          id: 'user-123', 
          email: 'test@example.com' 
        } 
      },
      error: null
    })

    // Mock profile query (no photo) - need to return the chain properly
    const mockSingleForProfile = vi.fn().mockResolvedValue({
      data: { profile_photo_url: null },
      error: null
    })
    const mockEqForProfile = vi.fn().mockReturnValue({ single: mockSingleForProfile })
    const mockSelectForProfile = vi.fn().mockReturnValue({ eq: mockEqForProfile })
    
    // Mock delete operations
    const mockEqForDelete = vi.fn().mockResolvedValue({ error: null })
    const mockDeleteForTable = vi.fn().mockReturnValue({ eq: mockEqForDelete })
    
    // Setup mockFrom to return different objects based on table
    mockFrom.mockImplementation((table) => {
      if (table === 'profiles') {
        return {
          select: mockSelectForProfile,
          delete: mockDeleteForTable
        }
      }
      return {
        delete: mockDeleteForTable
      }
    })
    
    // Mock successful user deletion
    mockDeleteUser.mockResolvedValue({
      data: {},
      error: null
    })

    const request = new NextRequest('http://localhost:3000/api/account/delete', {
      method: 'DELETE',
      body: JSON.stringify({ password: 'anypassword' })
    })

    const response = await DELETE(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.message).toBe('Account successfully deleted')
    
    // Verify deletion calls were made
    expect(mockFrom).toHaveBeenCalledWith('profiles')
    expect(mockFrom).toHaveBeenCalledWith('user_roles')
    expect(mockDeleteUser).toHaveBeenCalledWith('user-123')
  })
})