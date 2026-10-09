import { Button } from '../../components/ui/Button';
import { fmtInt, pct, portfolioRate } from './features';
import { getLoans, pageActions, useMounted, usePage } from './store';

/** Page-wide controls: one seed drives the data in every widget. */
export function DataControls() {
  const { seed } = usePage();
  const mounted = useMounted();
  const loans = mounted ? getLoans(seed) : null;
  return (
    <div
      role="group"
      aria-label="Data controls for every widget on this page"
      className="z-10 sm:sticky sm:top-0 my-4 flex flex-wrap items-center gap-2 rounded-md border border-grid bg-surface/95 p-2 text-sm backdrop-blur"
      style={{ minHeight: 56 }}
    >
      <Button onClick={pageActions.reshuffle}>Reshuffle data</Button>
      <Button onClick={pageActions.reset}>Reset page</Button>
      <span className="text-muted" role="status">
        {loans
          ? `Mock loan book #${seed}: ${fmtInt(loans.n)} small-business loans, ${pct(portfolioRate(loans))} defaulted.`
          : 'Loading mock loans…'}
      </span>
    </div>
  );
}
