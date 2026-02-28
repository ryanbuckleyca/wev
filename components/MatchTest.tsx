'use client'

import { useJobMatch } from '@/hooks/useJobMatch'

export default function MatchTest() {
  // Test with a known job ID
  const { match, loading, isValueMatched, matchPercentage } = useJobMatch('test-job-id')
  
  return (
    <div className="p-4 bg-wev-surface rounded-lg">
      <h3 className="text-lg font-semibold mb-2">Match Hook Test</h3>
      <div className="space-y-2 text-sm">
        <div>Loading: {loading ? 'Yes' : 'No'}</div>
        <div>Match Percentage: {matchPercentage}%</div>
        <div>Match Data: {match ? 'Found' : 'Not found'}</div>
        <div>Is 'test-value' matched: {isValueMatched('test-value') ? 'Yes' : 'No'}</div>
      </div>
    </div>
  )
}
