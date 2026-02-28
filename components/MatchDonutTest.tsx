'use client'

import MatchDonut from './MatchDonut'

export default function MatchDonutTest() {
  return (
    <div className="p-8 space-y-8">
      <h2 className="text-2xl font-bold text-wev-text-primary">Match Donut Chart Tests</h2>
      <p className="text-wev-text-secondary">Donut charts with thicker lines and better sizing for job cards.</p>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
        <div className="text-center space-y-2">
          <h3 className="text-sm font-medium text-wev-text-secondary">0% Match</h3>
          <div className="flex items-center gap-1">
            <MatchDonut percentage={0} size="md" />
            <span className="text-sm text-wev-text-secondary font-medium">0% match</span>
          </div>
        </div>
        
        <div className="text-center space-y-2">
          <h3 className="text-sm font-medium text-wev-text-secondary">25% Match</h3>
          <div className="flex items-center gap-1">
            <MatchDonut percentage={25} size="md" />
            <span className="text-sm text-wev-text-secondary font-medium">25% match</span>
          </div>
        </div>
        
        <div className="text-center space-y-2">
          <h3 className="text-sm font-medium text-wev-text-secondary">50% Match</h3>
          <div className="flex items-center gap-1">
            <MatchDonut percentage={50} size="md" />
            <span className="text-sm text-wev-text-secondary font-medium">50% match</span>
          </div>
        </div>
        
        <div className="text-center space-y-2">
          <h3 className="text-sm font-medium text-wev-text-secondary">75% Match</h3>
          <div className="flex items-center gap-1">
            <MatchDonut percentage={75} size="md" />
            <span className="text-sm text-wev-text-secondary font-medium">75% match</span>
          </div>
        </div>
        
        <div className="text-center space-y-2">
          <h3 className="text-sm font-medium text-wev-text-secondary">90% Match</h3>
          <div className="flex items-center gap-1">
            <MatchDonut percentage={90} size="md" />
            <span className="text-sm text-wev-text-secondary font-medium">90% match</span>
          </div>
        </div>
        
        <div className="text-center space-y-2">
          <h3 className="text-sm font-medium text-wev-text-secondary">100% Match</h3>
          <div className="flex items-center gap-1">
            <MatchDonut percentage={100} size="md" />
            <span className="text-sm text-wev-text-secondary font-medium">100% match</span>
          </div>
        </div>
        
        <div className="text-center space-y-2">
          <h3 className="text-sm font-medium text-wev-text-secondary">Small Size (14px)</h3>
          <div className="flex items-center gap-1">
            <MatchDonut percentage={60} size="sm" />
            <span className="text-sm text-wev-text-secondary font-medium">60% match</span>
          </div>
        </div>
        
        <div className="text-center space-y-2">
          <h3 className="text-sm font-medium text-wev-text-secondary">Large Size (20px)</h3>
          <div className="flex items-center gap-1">
            <MatchDonut percentage={60} size="lg" />
            <span className="text-sm text-wev-text-secondary font-medium">60% match</span>
          </div>
        </div>
      </div>
      
      <div className="mt-8 p-4 bg-wev-surface rounded-lg">
        <h3 className="text-lg font-semibold text-wev-text-primary mb-2">Color Legend:</h3>
        <div className="space-y-1 text-sm text-wev-text-secondary">
          <div>• 0%: Success green at 20% opacity (very faint)</div>
          <div>• 25%: Success green at 47.5% opacity</div>
          <div>• 50%: Success green at 65% opacity</div>
          <div>• 75%: Success green at 82.5% opacity</div>
          <div>• 100%: Success green at 100% opacity (full)</div>
        </div>
        <p className="text-xs text-wev-text-tertiary mt-2">
          Uses vibrant success green with variable opacity, border color for background
        </p>
      </div>
    </div>
  )
}
