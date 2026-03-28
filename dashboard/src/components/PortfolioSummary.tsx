import type { PortfolioStats } from '../api/client';

interface PortfolioSummaryProps {
  stats: PortfolioStats | null;
  loading: boolean;
}

export const PortfolioSummary = ({ stats, loading }: PortfolioSummaryProps) => {
  if (loading) {
    return (
      <div className="bg-slate-800 rounded-lg p-6 shadow-lg">
        <h2 className="text-xl font-semibold mb-4 text-slate-200">Portfolio Summary</h2>
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-slate-700 rounded w-3/4"></div>
          <div className="h-4 bg-slate-700 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="bg-slate-800 rounded-lg p-6 shadow-lg">
        <h2 className="text-xl font-semibold mb-4 text-slate-200">Portfolio Summary</h2>
        <p className="text-slate-400">No data available</p>
      </div>
    );
  }

  const pnlColor = stats.totalPnl >= 0 ? 'text-green-400' : 'text-red-400';
  const pnlSign = stats.totalPnl >= 0 ? '+' : '';

  return (
    <div className="bg-slate-800 rounded-lg p-6 shadow-lg">
      <h2 className="text-xl font-semibold mb-4 text-slate-200">Portfolio Summary</h2>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-700 rounded p-4">
          <p className="text-sm text-slate-400 mb-1">Total Positions</p>
          <p className="text-2xl font-bold text-white">{stats.totalPositions}</p>
        </div>
        
        <div className="bg-slate-700 rounded p-4">
          <p className="text-sm text-slate-400 mb-1">Portfolio Value</p>
          <p className="text-2xl font-bold text-white">${stats.totalValue.toFixed(2)}</p>
        </div>
        
        <div className="bg-slate-700 rounded p-4">
          <p className="text-sm text-slate-400 mb-1">Total PnL</p>
          <p className={`text-2xl font-bold ${pnlColor}`}>
            {pnlSign}${stats.totalPnl.toFixed(2)}
          </p>
        </div>
        
        <div className="bg-slate-700 rounded p-4">
          <p className="text-sm text-slate-400 mb-1">Capital Utilization</p>
          <p className="text-2xl font-bold text-white">{stats.capitalUtilization.toFixed(1)}%</p>
        </div>
      </div>
    </div>
  );
};
