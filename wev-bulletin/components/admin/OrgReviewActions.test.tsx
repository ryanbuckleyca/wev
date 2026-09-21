import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import OrgReviewActions from './OrgReviewActions';

const { pushMock, refreshMock, setReviewMock, notifySuccessMock, notifyErrorMock } = vi.hoisted(
  () => ({
    pushMock: vi.fn(),
    refreshMock: vi.fn(),
    setReviewMock: vi.fn(),
    notifySuccessMock: vi.fn(),
    notifyErrorMock: vi.fn(),
  }),
);

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const fn = (key: string) => key;
    fn.has = () => false;
    return fn;
  },
}));

vi.mock('@/lib/organizations/actions', () => ({
  setOrganizationAssessmentReview: setReviewMock,
}));

vi.mock('@/lib/toast', () => ({
  default: { success: notifySuccessMock, error: notifyErrorMock },
}));

describe('OrgReviewActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setReviewMock.mockResolvedValue({ ok: true, org: { id: 5, slug: 'riverside' } });
  });

  it('retries and refreshes on success', async () => {
    render(<OrgReviewActions orgId={5} currentReason="location_mismatch" locale="en" />);

    fireEvent.click(screen.getByText('actions.retry'));

    await waitFor(() => expect(setReviewMock).toHaveBeenCalledWith(5, 'retry'));
    expect(notifySuccessMock).toHaveBeenCalledWith('review.retrySuccess');
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it('ignores on request', async () => {
    render(<OrgReviewActions orgId={5} currentReason="location_mismatch" locale="en" />);

    fireEvent.click(screen.getByText('actions.ignore'));

    await waitFor(() => expect(setReviewMock).toHaveBeenCalledWith(5, 'ignore'));
    expect(notifySuccessMock).toHaveBeenCalledWith('review.ignoreSuccess');
  });

  it('hides Ignore when the org is already ignored', () => {
    render(<OrgReviewActions orgId={5} currentReason="ignored" locale="en" />);

    expect(screen.getByText('actions.retry')).toBeInTheDocument();
    expect(screen.queryByText('actions.ignore')).not.toBeInTheDocument();
  });

  it('surfaces a failed action without refreshing', async () => {
    setReviewMock.mockResolvedValue({ ok: false, error: 'database_error' });
    render(<OrgReviewActions orgId={5} currentReason="llm_error" locale="en" />);

    fireEvent.click(screen.getByText('actions.retry'));

    await waitFor(() => expect(notifyErrorMock).toHaveBeenCalledWith('review.actionFailed'));
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('redirects to login when the session expired', async () => {
    setReviewMock.mockResolvedValue({ ok: false, error: 'unauthorized' });
    render(<OrgReviewActions orgId={5} currentReason="llm_error" locale="en" />);

    fireEvent.click(screen.getByText('actions.retry'));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/en/login'));
    expect(notifyErrorMock).toHaveBeenCalledWith('errors.unauthorized');
  });

  it('dissolves its wrapper when asked, so buttons align with the caller\u2019s own', () => {
    // The table row puts Edit alongside these; a nested flex wrapper would let
    // Retry/Ignore wrap and align independently, which looked ragged.
    const { container } = render(
      <OrgReviewActions orgId={5} currentReason="llm_error" locale="en" className="contents" />,
    );

    expect(container.firstElementChild).toHaveClass('contents');
  });

  it('keeps its own flex wrapper by default', () => {
    const { container } = render(
      <OrgReviewActions orgId={5} currentReason="llm_error" locale="en" />,
    );

    expect(container.firstElementChild).toHaveClass('flex', 'flex-wrap');
  });

  it('does not fire actions while disabled', () => {
    render(<OrgReviewActions orgId={5} currentReason="llm_error" locale="en" disabled />);

    fireEvent.click(screen.getByText('actions.retry'));

    expect(setReviewMock).not.toHaveBeenCalled();
  });
});
