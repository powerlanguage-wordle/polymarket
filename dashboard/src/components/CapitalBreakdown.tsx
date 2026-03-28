import type { CapitalOverview } from '../api/client';

interface CapitalBreakdownProps {
  overview: CapitalOverview | null;
  loading: boolean;
}

export const CapitalBreakdown = ({ overview, loading }: CapitalBreakdownProps) => {
  if (loading) {
    return (
      <div className="bg-slate-800 rounded-lg p-6 shadow-lg">
        <h2 className="text-xl font-semibold mb-4 text-slate-200">Capital Breakdown</h2>
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-slate-700 rounded w-3/4"></div>
          <div className="h-4 bg-slate-700 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="bg-slate-800 rounded-lg p-6 shadow-lg">
        <h2 className="text-xl font-semibold mb-4 text-slate-200">Capital Breakdown</h2>
        <p className="text-slate-400">No data available</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 rounded-lg p-6 shadow-lg">
      <h2 className="text-xl font-semibold mb-4 text-slate-200">Capital Breakdown</h2>
      
      <div className="space-y-4 mb-6">
        <div className="flex justify-between items-center">
          <span className="text-slate-400">Total Capital</span>
          <span className="text-white font-semibold">${overview.totalCapital.toFixed(2)}</span>
        </div>
        
        <div className="flex justify-between items-center">
          <span className="text-slate-400">Allocated Capital</span>
          <span className="text-yellow-400 font-semibold">${overview.allocatedCapital.toFixed(2)}</span>
        </div>
        
        <div className="flex justify-between items-center">
          <span className="text-slate-400">Available Capital</span>
          <span className="text-green-400 font-semibold">${overview.availableCapital.toFixed(2)}</span>
        </div>
      </div>

      {/* Utilization Bar */}
      <div className="mb-6">
        <div className="flex justify-between mb-2">
          <span className="text-sm text-slate-400">Utilization</span>
          <span className="text-sm text-white font-medium">{overview.utilizationPercentage.toFixed(1)}%</span>
        </div>
        <div className="w-full bg-slate-700 rounded-full h-3">
          <div 
            className="bg-gradient-to-r from-blue-500 to-purple-500 h-3 rounded-full transition-all duration-300"
            style={{ width: `${Math.min(overview.utilizationPercentage, 100)}%` }}
          ></div>
        </div>
      </div>

      {/* Market Exposure */}
      {overview.exposureByMarket.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-300 mb-3">Market Exposure</h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {overview.exposureByMarket.map((exposure, index) => (
              <div key={index} className="bg-slate-700 rounded p-3">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm text-slate-300 truncate flex-1 mr-2">
                    {exposure.market.substring(0, 12)}...
                  </span>
                  <span className="text-sm text-white font-medium whitespace-nowrap">
                    ${exposure.exposure.toFixed(2)}
                  </span>
                </div>
                <div className="w-full bg-slate-600 rounded-full h-1.5">
                  <div 
                    className="bg-blue-500 h-1.5 rounded-full"
                    style={{ width: `${Math.min(exposure.percentage, 100)}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
