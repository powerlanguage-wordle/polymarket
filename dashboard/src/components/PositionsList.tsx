import type { Position } from '../api/client';

interface PositionsListProps {
  positions: Position[];
  loading: boolean;
}

export const PositionsList = ({ positions, loading }: PositionsListProps) => {
  if (loading) {
    return (
      <div className="bg-slate-800 rounded-lg p-6 shadow-lg">
        <h2 className="text-xl font-semibold mb-4 text-slate-200">Open Positions</h2>
        <div className="animate-pulse space-y-4">
          <div className="h-16 bg-slate-700 rounded"></div>
          <div className="h-16 bg-slate-700 rounded"></div>
          <div className="h-16 bg-slate-700 rounded"></div>
        </div>
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="bg-slate-800 rounded-lg p-6 shadow-lg">
        <h2 className="text-xl font-semibold mb-4 text-slate-200">Open Positions</h2>
        <div className="text-center py-8">
          <p className="text-slate-400">No open positions</p>
          <p className="text-sm text-slate-500 mt-2">Positions will appear here when trades are executed</p>
        </div>
      </div>
    );
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="bg-slate-800 rounded-lg p-6 shadow-lg">
      <h2 className="text-xl font-semibold mb-4 text-slate-200">
        Open Positions ({positions.length})
      </h2>
      
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left py-3 px-2 text-sm font-semibold text-slate-300">Market</th>
              <th className="text-left py-3 px-2 text-sm font-semibold text-slate-300">Outcome</th>
              <th className="text-center py-3 px-2 text-sm font-semibold text-slate-300">Side</th>
              <th className="text-right py-3 px-2 text-sm font-semibold text-slate-300">Size</th>
              <th className="text-right py-3 px-2 text-sm font-semibold text-slate-300">Entry</th>
              <th className="text-right py-3 px-2 text-sm font-semibold text-slate-300">Current</th>
              <th className="text-right py-3 px-2 text-sm font-semibold text-slate-300">PnL</th>
              <th className="text-right py-3 px-2 text-sm font-semibold text-slate-300">PnL %</th>
              <th className="text-left py-3 px-2 text-sm font-semibold text-slate-300">Opened</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((position) => {
              const pnlColor = position.pnl >= 0 ? 'text-green-400' : 'text-red-400';
              const pnlSign = position.pnl >= 0 ? '+' : '';
              const pnlPercentColor = position.pnlPercentage >= 0 ? 'text-green-400' : 'text-red-400';
              const pnlPercentSign = position.pnlPercentage >= 0 ? '+' : '';
              
              return (
                <tr key={position.id} className="border-b border-slate-700 hover:bg-slate-750 transition-colors">
                  <td className="py-3 px-2 text-sm text-slate-200 max-w-xs truncate" title={position.market}>
                    {position.market.substring(0, 20)}...
                  </td>
                  <td className="py-3 px-2 text-sm">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      position.outcome === 'YES' 
                        ? 'bg-green-900/30 text-green-300' 
                        : 'bg-red-900/30 text-red-300'
                    }`}>
                      {position.outcome}
                    </span>
                  </td>
                  <td className="py-3 px-2 text-sm text-center">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      position.side === 'BUY' 
                        ? 'bg-blue-900/30 text-blue-300' 
                        : 'bg-orange-900/30 text-orange-300'
                    }`}>
                      {position.side}
                    </span>
                  </td>
                  <td className="py-3 px-2 text-sm text-right text-slate-200">
                    {position.size.toFixed(2)}
                  </td>
                  <td className="py-3 px-2 text-sm text-right text-slate-200">
                    ${position.entryPrice.toFixed(4)}
                  </td>
                  <td className="py-3 px-2 text-sm text-right text-slate-200">
                    {position.currentPrice ? `$${position.currentPrice.toFixed(4)}` : '-'}
                  </td>
                  <td className={`py-3 px-2 text-sm text-right font-semibold ${pnlColor}`}>
                    {pnlSign}${position.pnl.toFixed(2)}
                  </td>
                  <td className={`py-3 px-2 text-sm text-right font-semibold ${pnlPercentColor}`}>
                    {pnlPercentSign}{position.pnlPercentage.toFixed(2)}%
                  </td>
                  <td className="py-3 px-2 text-sm text-slate-400">
                    {formatDate(position.openedAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
